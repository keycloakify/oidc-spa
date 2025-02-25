import type { UserManager as OidcClientTsUserManager } from "../vendor/frontend/oidc-client-ts-and-jwt-decode";
import { Deferred } from "../tools/Deferred";
import { id, assert } from "../vendor/frontend/tsafe";
import { getStateData, clearStateStore, type StateData } from "./StateData";
import { getDownlinkAndRtt } from "../tools/getDownlinkAndRtt";
import { getIsDev } from "../tools/isDev";
import type { User as OidcClientTsUser } from "../vendor/frontend/oidc-client-ts-and-jwt-decode";

export type AuthResponse = {
    state: string;
    [key: string]: string;
};

function getIsAuthResponse(data: any): data is AuthResponse {
    return data instanceof Object && "state" in data && typeof data.state === "string";
}

export function authResponseToUrl(authResponse: AuthResponse): string {
    const authResponseUrl = new URL("https://dummy.com");

    for (const [name, value] of Object.entries(authResponse)) {
        authResponseUrl.searchParams.set(name, value);
    }

    return authResponseUrl.href;
}

type ResultOfLoginSilent =
    | {
          outcome: "got auth response from iframe";
          authResponse: AuthResponse;
      }
    | {
          outcome: "failure";
          cause: "timeout" | "can't reach well-known oidc endpoint";
      }
    | {
          outcome: "token refreshed using refresh token";
          oidcClientTsUser: OidcClientTsUser;
      };

export async function loginSilent(params: {
    oidcClientTsUserManager: OidcClientTsUserManager;
    stateQueryParamValue_instance: string;
    configId: string;
    getExtraTokenParams: (() => Record<string, string>) | undefined;
}): Promise<ResultOfLoginSilent> {
    const { oidcClientTsUserManager, stateQueryParamValue_instance, configId, getExtraTokenParams } =
        params;

    const dResult = new Deferred<ResultOfLoginSilent>();

    const timeoutDelayMs: number = (() => {
        const downlinkAndRtt = getDownlinkAndRtt();
        const isDev = getIsDev();

        // Base delay is the minimum delay we should wait in any case
        //const BASE_DELAY_MS = 3000;
        const BASE_DELAY_MS = isDev ? 9_000 : 7_000;

        if (downlinkAndRtt === undefined) {
            return BASE_DELAY_MS;
        }

        const { downlink, rtt } = downlinkAndRtt;

        // Calculate dynamic delay based on RTT and downlink
        // Add 1 to downlink to avoid division by zero
        const dynamicDelay = rtt * 2.5 + BASE_DELAY_MS / (downlink + 1);

        return Math.max(BASE_DELAY_MS, dynamicDelay);
    })();

    const timeout = setTimeout(async () => {
        dResult.resolve({
            outcome: "failure",
            cause: "timeout"
        });
    }, timeoutDelayMs);

    const listener = (event: MessageEvent) => {
        if (!getIsAuthResponse(event.data)) {
            return;
        }

        const authResponse = event.data;

        const stateData = getStateData({ stateQueryParamValue: authResponse.state });

        assert(stateData !== undefined);
        assert(stateData.context === "iframe");

        if (stateData.configId !== configId) {
            return;
        }

        clearTimeout(timeout);

        window.removeEventListener("message", listener);

        dResult.resolve({
            outcome: "got auth response from iframe",
            authResponse
        });
    };

    window.addEventListener("message", listener, false);

    oidcClientTsUserManager
        .signinSilent({
            state: id<StateData.IFrame>({
                context: "iframe",
                configId
            }),
            silentRequestTimeoutInSeconds: timeoutDelayMs / 1000,
            extraTokenParams: getExtraTokenParams?.()
        })
        .then(
            oidcClientTsUser => {
                assert(oidcClientTsUser !== null, "oidcClientTsUser is not supposed to be null here");

                clearTimeout(timeout);

                dResult.resolve({
                    outcome: "token refreshed using refresh token",
                    oidcClientTsUser
                });
            },
            (error: Error) => {
                if (error.message === "Failed to fetch") {
                    // NOTE: If we got an error here it means that the fetch to the
                    // well-known oidc endpoint failed.
                    // This usually means that the server is down or that the issuerUri
                    // is not pointing to a valid oidc server.
                    // It could be a CORS error on the well-known endpoint but it's unlikely.

                    clearTimeout(timeout);

                    dResult.resolve({
                        outcome: "failure",
                        cause: "can't reach well-known oidc endpoint"
                    });

                    return;
                }

                // NOTE: Here, except error on our understanding there can't be any other
                // error than timeout so we fail silently and let the timeout expire.
            }
        );

    dResult.pr.then(result => {
        if (result.outcome === "failure") {
            clearStateStore({ stateQueryParamValue: stateQueryParamValue_instance });
        }
    });

    return dResult.pr;
}
