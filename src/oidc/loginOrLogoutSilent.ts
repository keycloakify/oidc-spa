import type { UserManager as OidcClientTsUserManager } from "../vendor/frontend/oidc-client-ts-and-jwt-decode";
import { getIFrameTimeoutDelayMs } from "./iframeTimeoutDelay";
import { Deferred } from "../tools/Deferred";
import { id } from "../vendor/frontend/tsafe";
import { getStateData, type StateData } from "./StateData";
import { addQueryParamToUrl } from "../tools/urlQueryParams";

export type AuthResponse = {
    state: string;
    [key: string]: string;
};

function getIsAuthResponse(data: any): data is AuthResponse {
    return data instanceof Object && "state" in data && typeof data.state === "string";
}

export function authResponseToUrl(authResponse: AuthResponse): string {
    let authResponseUrl = "https://dummy.com";

    for (const [name, value] of Object.entries(authResponse)) {
        authResponseUrl = addQueryParamToUrl({
            "url": authResponseUrl,
            name,
            value
        }).newUrl;
    }

    return authResponseUrl;
}

type ResultOfLoginOrLogoutSilent =
    | {
          isSuccess: true;
          authResponse: AuthResponse;
      }
    | {
          isSuccess: false;
          cause: "timeout" | "server down";
      };

export async function loginOrLogoutSilent(params: {
    oidcClientTsUserManager: OidcClientTsUserManager;
    configHash: string;
    action:
        | {
              type: "login";
              getExtraTokenParams: (() => Record<string, string>) | undefined;
          }
        | {
              type: "logout";
          };
}): Promise<ResultOfLoginOrLogoutSilent> {
    const { oidcClientTsUserManager, configHash, action } = params;

    const dResult = new Deferred<ResultOfLoginOrLogoutSilent>();

    const timeoutDelayMs = getIFrameTimeoutDelayMs();

    const timeout = setTimeout(async () => {
        dResult.reject({
            "isSuccess": false,
            "cause": "timeout"
        });
    }, timeoutDelayMs);

    const listener = (event: MessageEvent) => {
        if (!getIsAuthResponse(event.data)) {
            return;
        }

        const authResponse = event.data;

        const stateData = getStateData({ state: authResponse.state });

        if (stateData === undefined) {
            return;
        }

        if (stateData.configHash !== configHash) {
            return;
        }

        clearTimeout(timeout);

        window.removeEventListener("message", listener);

        dResult.resolve({
            "isSuccess": true,
            authResponse
        });
    };

    window.addEventListener("message", listener, false);

    (() => {
        const params_common = {
            "state": id<StateData>({
                configHash,
                "isSilentSso": true
            }),
            "silentRequestTimeoutInSeconds": timeoutDelayMs / 1000
        };

        switch (action.type) {
            case "login":
                return oidcClientTsUserManager.signinSilent({
                    ...params_common,
                    "extraTokenParams": action.getExtraTokenParams?.()
                });
            case "logout":
                return oidcClientTsUserManager.signoutSilent({
                    ...params_common
                });
        }
    })().catch((error: Error) => {
        if (error.message === "Failed to fetch") {
            // NOTE: If we got an error here it means that the fetch to the
            // well-known oidc endpoint failed.
            // This usually means that the server is down or that the issuerUri
            // is not pointing to a valid oidc server.
            // It could be a CORS error on the well-known endpoint but it's unlikely.

            clearTimeout(timeout);

            dResult.resolve({
                "isSuccess": false,
                "cause": "server down"
            });

            return;
        }

        // NOTE: Here, except error on our understanding there can't be any other
        // error than timeout so we fail silently and let the timeout expire.
    });

    return dResult.pr;
}