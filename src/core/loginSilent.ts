import type {
    UserManager as OidcClientTsUserManager,
    User as OidcClientTsUser
} from "../vendor/frontend/oidc-client-ts";
import { Deferred } from "../tools/Deferred";
import { assert } from "../tools/tsafe/assert";
import { id } from "../tools/tsafe/id";
import { noUndefined } from "../tools/tsafe/noUndefined";
import { getStateData, clearStateStore, type StateData } from "./StateData";
import { getDownlinkAndRtt } from "../tools/getDownlinkAndRtt";
import { getIsDev } from "../tools/isDev";
import { type AuthResponse } from "./AuthResponse";
import { addOrUpdateSearchParam } from "../tools/urlSearchParams";
import { getIsOnline } from "../tools/getIsOnline";
import { getEvtIframeAuthResponse } from "./earlyInit";

type ResultOfLoginSilent =
    | {
          outcome: "got auth response from iframe";
          authResponse: AuthResponse;
      }
    | {
          outcome: "timeout";
      }
    | {
          outcome: "token refreshed using refresh token";
          oidcClientTsUser: OidcClientTsUser;
      };

export async function loginSilent(params: {
    oidcClientTsUserManager: OidcClientTsUserManager;
    stateUrlParamValue_instance: string;
    configId: string;

    transformUrlBeforeRedirect:
        | ((params: { authorizationUrl: string; isSilent: true }) => string)
        | undefined;

    getExtraQueryParams:
        | ((params: { isSilent: true; url: string }) => Record<string, string | undefined>)
        | undefined;

    getExtraTokenParams: (() => Record<string, string | undefined>) | undefined;
    autoLogin: boolean;
    log: typeof console.log | undefined;
}): Promise<ResultOfLoginSilent> {
    const {
        oidcClientTsUserManager,
        stateUrlParamValue_instance,
        configId,
        transformUrlBeforeRedirect,
        getExtraQueryParams,
        getExtraTokenParams,
        autoLogin,
        log
    } = params;

    delay_until_online: {
        const { isOnline, prOnline } = getIsOnline();
        if (isOnline) {
            break delay_until_online;
        }
        log?.("The browser seems offline, waiting to get back a connection before proceeding to login");
        await prOnline;
    }

    const dResult = new Deferred<ResultOfLoginSilent>();

    const timeoutDelayMs: number = (() => {
        const isDev = getIsDev();

        const downlinkAndRtt = getDownlinkAndRtt();

        // Base delay is the minimum delay we should wait in any case
        const BASE_DELAY_MS = isDev ? 9_000 : autoLogin ? 25_000 : 7_000;

        if (downlinkAndRtt === undefined) {
            return BASE_DELAY_MS;
        }

        const { downlink, rtt } = downlinkAndRtt;

        // Calculate dynamic delay based on RTT and downlink
        // Add 1 to downlink to avoid division by zero
        const dynamicDelay = rtt * 2.5 + BASE_DELAY_MS / (downlink + 1);

        return Math.max(BASE_DELAY_MS, dynamicDelay);
    })();

    let clearTimeouts: (params: { wasSuccess: boolean }) => void;
    {
        let hasLoggedWarningMessage = false;

        const timeouts = [
            setTimeout(() => {
                dResult.resolve({
                    outcome: "timeout"
                });
            }, timeoutDelayMs),
            setTimeout(() => {
                console.warn(
                    [
                        "oidc-spa: Session restoration is taking longer than expected.",
                        "This likely indicates a misconfiguration.",
                        `Waiting ${Math.floor(
                            timeoutDelayMs / 1_000
                        )} seconds before running diagnostics.`,
                        "Once the timeout expires, helpful debugging information will be printed to the console."
                    ].join(" ")
                );
                hasLoggedWarningMessage = true;
            }, 2_000)
        ];

        clearTimeouts = ({ wasSuccess }) => {
            timeouts.forEach(clearTimeout);
            if (wasSuccess && hasLoggedWarningMessage) {
                console.log(
                    [
                        "oidc-spa: Never mind, the auth server was just slow to respond.",
                        "You can safely ignore the previous warning."
                    ].join(" ")
                );
            }
        };
    }

    const { unsubscribe: unsubscribe_evtIframeAuthResponse } = getEvtIframeAuthResponse().subscribe(
        authResponse => {
            if (authResponse.state !== stateUrlParamValue_instance) {
                return;
            }

            unsubscribe_evtIframeAuthResponse();

            const stateData = getStateData({ stateUrlParamValue: authResponse.state });

            assert(stateData !== undefined, "765645");
            assert(stateData.context === "iframe", "250711");
            assert(stateData.configId === configId, "4922732");

            clearTimeouts({ wasSuccess: true });

            dResult.resolve({
                outcome: "got auth response from iframe",
                authResponse
            });
        }
    );

    const transformUrl_oidcClientTs = (url: string) => {
        add_extra_query_params: {
            if (getExtraQueryParams === undefined) {
                break add_extra_query_params;
            }

            const extraQueryParams = getExtraQueryParams({ isSilent: true, url });

            for (const [name, value] of Object.entries(extraQueryParams)) {
                if (value === undefined) {
                    continue;
                }
                url = addOrUpdateSearchParam({ url, name, value, encodeMethod: "www-form" });
            }
        }

        apply_transform_url: {
            if (transformUrlBeforeRedirect === undefined) {
                break apply_transform_url;
            }
            url = transformUrlBeforeRedirect({ authorizationUrl: url, isSilent: true });
        }

        return url;
    };

    oidcClientTsUserManager
        .signinSilent({
            state: id<StateData.IFrame>({
                context: "iframe",
                configId
            }),
            silentRequestTimeoutInSeconds: timeoutDelayMs / 1000,
            extraTokenParams:
                getExtraTokenParams === undefined ? undefined : noUndefined(getExtraTokenParams()),
            transformUrl: transformUrl_oidcClientTs
        })
        .then(
            oidcClientTsUser => {
                assert(oidcClientTsUser !== null, "oidcClientTsUser is not supposed to be null here");

                clearTimeouts({ wasSuccess: true });
                unsubscribe_evtIframeAuthResponse();

                dResult.resolve({
                    outcome: "token refreshed using refresh token",
                    oidcClientTsUser
                });
            },
            () => {
                // NOTE: Here, except error on our understanding there can't be any other
                // error than timeout so we fail silently and let the timeout expire.
            }
        );

    dResult.pr.then(result => {
        if (result.outcome === "timeout") {
            clearStateStore({ stateUrlParamValue: stateUrlParamValue_instance });
            unsubscribe_evtIframeAuthResponse();
        }
    });

    return dResult.pr;
}
