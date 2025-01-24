import type { UserManager as OidcClientTsUserManager } from "../vendor/frontend/oidc-client-ts-and-jwt-decode";
import { getIFrameTimeoutDelayMs } from "./iframeTimeoutDelay";
import { Deferred } from "../tools/Deferred";
import { OidcInitializationError } from "./OidcInitializationError";
import { assert, id } from "../vendor/frontend/tsafe";
import { getStateData, type StateData } from "./StateData";
import { addQueryParamToUrl } from "../tools/urlQueryParams";
import { getConfigHash } from "./configHash";

type AuthResponse = {
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

export async function loginOrLogoutSilent(params: {
    oidcClientTsUserManager: OidcClientTsUserManager;
    clientId: string;
    issuerUri: string;
    urls: {
        hasDedicatedHtmFile: boolean;
        callbackUrl: string;
    };
    action:
        | {
              type: "login";
              getExtraTokenParams: (() => Record<string, string>) | undefined;
          }
        | {
              type: "logout";
          };
}): Promise<{ authResponse: AuthResponse }> {
    const { issuerUri, clientId, oidcClientTsUserManager, urls, action } = params;

    const configHash = getConfigHash({ clientId, issuerUri });

    const dAuthResponse = new Deferred<AuthResponse>();

    const timeoutDelayMs = getIFrameTimeoutDelayMs();

    const timeout = setTimeout(async () => {
        if (action === "logout") {
            dAuthResponse.reject(new Error("Logout timeout"));
            return;
        }

        let dedicatedSilentSsoHtmlFileCsp: string | null | undefined = undefined;

        oidc_callback_htm_unreachable: {
            if (!urls.hasDedicatedHtmFile) {
                break oidc_callback_htm_unreachable;
            }

            const getHtmFileReachabilityStatus = async (ext?: "html") =>
                fetch(`${urls.callbackUrl}${ext === "html" ? "l" : ""}`).then(
                    async response => {
                        dedicatedSilentSsoHtmlFileCsp = response.headers.get("Content-Security-Policy");

                        const content = await response.text();

                        return content.length < 1200 &&
                            content.includes("parent.postMessage(authResponse")
                            ? "ok"
                            : "reachable but wrong content";
                    },
                    () => "not reachable" as const
                );

            const status = await getHtmFileReachabilityStatus();

            if (status === "ok") {
                break oidc_callback_htm_unreachable;
            }

            dAuthResponse.reject(
                new OidcInitializationError({
                    "type": "bad configuration",
                    "likelyCause": {
                        "type": "oidc-callback.htm not properly served",
                        "oidcCallbackHtmUrl": urls.callbackUrl,
                        "likelyCause": await (async () => {
                            if ((await getHtmFileReachabilityStatus("html")) === "ok") {
                                return "using .html instead of .htm extension";
                            }

                            switch (status) {
                                case "not reachable":
                                    return "the file hasn't been created";
                                case "reachable but wrong content":
                                    return "serving another file";
                            }
                        })()
                    }
                })
            );
            return;
        }

        frame_ancestors_none: {
            const csp = await (async () => {
                if (urls.hasDedicatedHtmFile) {
                    assert(dedicatedSilentSsoHtmlFileCsp !== undefined);
                    return dedicatedSilentSsoHtmlFileCsp;
                }

                const csp = await fetch(urls.callbackUrl).then(
                    response => response.headers.get("Content-Security-Policy"),
                    error => id<Error>(error)
                );

                if (csp instanceof Error) {
                    dAuthResponse.reject(
                        new Error(`Failed to fetch ${urls.callbackUrl}: ${csp.message}`)
                    );
                    return new Promise<never>(() => {});
                }

                return csp;
            })();

            if (csp === null) {
                break frame_ancestors_none;
            }

            const hasFrameAncestorsNone = csp
                .replace(/["']/g, "")
                .replace(/\s+/g, " ")
                .toLowerCase()
                .includes("frame-ancestors none");

            if (!hasFrameAncestorsNone) {
                break frame_ancestors_none;
            }

            dAuthResponse.reject(
                new OidcInitializationError({
                    "type": "bad configuration",
                    "likelyCause": {
                        "type": "frame-ancestors none",
                        urls
                    }
                })
            );
            return;
        }

        // Here we know that the server is not down and that the issuer_uri is correct
        // otherwise we would have had a fetch error when loading the iframe.
        // So this means that it's very likely a OIDC client misconfiguration.
        // It could also be a very slow network but this risk is mitigated by the fact that we check
        // for the network speed to adjust the timeout delay.
        dAuthResponse.reject(
            new OidcInitializationError({
                "type": "bad configuration",
                "likelyCause": {
                    "type": "misconfigured OIDC client",
                    clientId,
                    timeoutDelayMs,
                    "callbackUrl": urls.callbackUrl
                }
            })
        );
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

        dAuthResponse.resolve(authResponse);
    };

    window.addEventListener("message", listener, false);

    (() => {
        switch (action.type) {
            case "login":
                return oidcClientTsUserManager.signinSilent({
                    "silentRequestTimeoutInSeconds": timeoutDelayMs / 1000,
                    "extraTokenParams": action.getExtraTokenParams?.(),
                    "state": id<StateData>({
                        configHash,
                        "isSilentSso": true
                    })
                });
            case "logout":
                return oidcClientTsUserManager.signoutSilent({
                    "silentRequestTimeoutInSeconds": timeoutDelayMs / 1000,
                    "state": id<StateData>({
                        configHash,
                        "isSilentSso": true
                    })
                });
        }
    })().catch((error: Error) => {
        if (error.message !== "Failed to fetch") {
            // We let it timeout
            return;
        }

        clearTimeout(timeout);

        dAuthResponse.reject(
            (() => {
                switch (action.type) {
                    // Here we know it's not web origin because it's not the token we are fetching
                    // but just the well known configuration endpoint that is not subject to CORS.
                    case "login":
                        return new OidcInitializationError({
                            "type": "server down",
                            issuerUri
                        });
                    case "logout":
                        return new Error("Server down");
                }
            })()
        );
    });

    // NOTE: This expression has expected rejections.
    const authResponse = await dAuthResponse.pr;

    return { authResponse };
}
