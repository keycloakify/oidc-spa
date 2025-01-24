import { assert, type Equals } from "../vendor/frontend/tsafe";

export class OidcInitializationError2 extends Error {
    public readonly isAuthServerLikelyDown: boolean;

    constructor(params: { messageOrCause: string | Error; isAuthServerLikelyDown: boolean }) {
        super(
            (() => {
                if (typeof params.messageOrCause === "string") {
                    return params.messageOrCause;
                } else {
                    return `Unknown initialization error: ${params.messageOrCause.message}`;
                }
            })(),
            // @ts-expect-error
            { "cause": typeof params.messageOrCause === "string" ? undefined : params.messageOrCause }
        );
        this.isAuthServerLikelyDown = params.isAuthServerLikelyDown;
        Object.setPrototypeOf(this, new.target.prototype);
    }
}

function parseKeycloakIssuerUri(issuerUri: string):
    | undefined
    | {
          origin: string;
          realm: string;
          // If defined must start with / and end with no /
          kcHttpRelativePath: string | undefined;
      } {
    const url = new URL(issuerUri);

    const split = url.pathname.split("/realms/");

    if (split.length !== 2) {
        return undefined;
    }

    const [kcHttpRelativePath, realm] = split;

    return {
        "origin": url.origin,
        realm,
        kcHttpRelativePath: kcHttpRelativePath === "" ? undefined : kcHttpRelativePath
    };
}

function getIsValidRemoteJson(url: string): Promise<boolean> {
    return fetch(url).then(
        async response => {
            if (!response.ok) {
                return false;
            }

            try {
                await response.json();
            } catch {
                return false;
            }

            return true;
        },
        () => false
    );
}

export async function createWellKnownOidcConfigurationEndpointUnreachableInitializationError(params: {
    issuerUri: string;
}): Promise<OidcInitializationError2> {
    const { issuerUri } = params;

    const issuerUri_parsed = parseKeycloakIssuerUri(issuerUri);

    const WELL_KNOWN_PATH = "/.well-known/openid-configuration";

    const commonFallbackMessagePart = [
        `The OIDC server is either down or the issuerUri you provided is incorrect.`,
        `You provided the issuerUri: ${issuerUri}`,
        `Endpoint that couldn't be reached: ${issuerUri}${WELL_KNOWN_PATH}`
    ].join("\n");

    if (issuerUri_parsed === undefined) {
        return new OidcInitializationError2({
            "messageOrCause": [
                commonFallbackMessagePart,
                ``,
                `If you happen to be using Keycloak, be aware that the issuerUri you provided doesn't match the expected shape.`,
                `It should look like: https://<YOUR_KEYCLOAK_DOMAIN><KC_HTTP_RELATIVE_PATH>/realms/<YOUR_REALM>`,
                `Unless configured otherwise the KC_HTTP_RELATIVE_PATH is '/' by default on recent version of Keycloak.`
            ].join("\n"),
            "isAuthServerLikelyDown": true
        });
    }

    const getCandidateIssuerUri = (params: { kcHttpRelativePath: string | undefined }) => {
        const { kcHttpRelativePath } = params;

        return `${issuerUri_parsed.origin}${
            kcHttpRelativePath === undefined ? "" : kcHttpRelativePath
        }/realms/${issuerUri_parsed.realm}`;
    };

    if (issuerUri_parsed.kcHttpRelativePath === undefined) {
        const issuerUri_candidate = getCandidateIssuerUri({ "kcHttpRelativePath": "/auth" });

        const isValid = await getIsValidRemoteJson(`${issuerUri_candidate}${WELL_KNOWN_PATH}`);

        if (isValid) {
            return new OidcInitializationError2({
                "messageOrCause": [
                    `Your Keycloak server is configured with KC_HTTP_RELATIVE_PATH=/auth`,
                    `The issuerUri you provided: ${issuerUri}`,
                    `The correct issuerUri is: ${issuerUri_candidate}`,
                    `(You are missing the /auth portion)`
                ].join("\n"),
                "isAuthServerLikelyDown": false
            });
        }
    } else {
        const issuerUri_candidate = getCandidateIssuerUri({ "kcHttpRelativePath": undefined });

        const isValid = await getIsValidRemoteJson(`${issuerUri_candidate}${WELL_KNOWN_PATH}`);

        if (isValid) {
            return new OidcInitializationError2({
                "messageOrCause": [
                    `Your Keycloak server is configured with KC_HTTP_RELATIVE_PATH=/`,
                    `The issuerUri you provided: ${issuerUri}`,
                    `The correct issuerUri is: ${issuerUri_candidate}`,
                    `(You should remove the ${issuerUri_parsed.kcHttpRelativePath} portion.)`
                ].join("\n"),
                "isAuthServerLikelyDown": false
            });
        }
    }

    return new OidcInitializationError2({
        "messageOrCause": [
            commonFallbackMessagePart,
            ``,
            `Given the shape of the issuerUri you provided, it seems that you are using Keycloak.`,
            `- Make sure the realm '${issuerUri_parsed.realm}' exists.`,
            `- Check the KC_HTTP_RELATIVE_PATH that you might have configured your keycloak server with.`,
            `  For example if you have KC_HTTP_RELATIVE_PATH=/xxx the issuerUri should be ${getCandidateIssuerUri(
                { "kcHttpRelativePath": "/xxx" }
            )}`
        ].join("\n"),
        "isAuthServerLikelyDown": true
    });
}

export class OidcInitializationError extends Error {
    public readonly type: "server down" | "bad configuration" | "unknown";

    constructor(
        params:
            | {
                  type: "server down";
                  issuerUri: string;
              }
            | {
                  type: "bad configuration";
                  likelyCause:
                      | {
                            // Most likely redirect URIs or the client does not exist.
                            type: "misconfigured OIDC client";
                            clientId: string;
                            timeoutDelayMs: number;
                            callbackUrl: string;
                        }
                      | {
                            type: "not in Web Origins";
                            clientId: string;
                        }
                      | {
                            type: "oidc-callback.htm not properly served";
                            oidcCallbackHtmUrl: string;
                            likelyCause:
                                | "serving another file"
                                | "the file hasn't been created"
                                | "using .html instead of .htm extension";
                        }
                      | {
                            type: "frame-ancestors none";
                            urls: {
                                hasDedicatedHtmFile: boolean;
                                callbackUrl: string;
                            };
                        };
              }
            | {
                  type: "unknown";
                  cause: Error;
              }
    ) {
        super(
            (() => {
                switch (params.type) {
                    case "server down":
                        return [
                            `The OIDC server seems to be down. Or the issuerUri you provided is incorrect.`,
                            ``,
                            `issuerUri: ${params.issuerUri}`,
                            `Endpoint that couldn't be reached: ${params.issuerUri}/.well-known/openid-configuration`,
                            ``,
                            `If you know it's not the case it means that the issuerUri: ${params.issuerUri} is incorrect.`,
                            `If you are using Keycloak makes sure that the realm exists and that the url is well formed.\n`,
                            `More info: https://docs.oidc-spa.dev/v/v5/resources/usage-with-keycloak`
                        ].join("\n");
                    case "bad configuration":
                        switch (params.likelyCause.type) {
                            case "misconfigured OIDC client":
                                return [
                                    `The OIDC client ${params.likelyCause.clientId} seems to be misconfigured on your OIDC server.`,
                                    `If you are using Keycloak you likely need to add "${params.likelyCause.callbackUrl}" to the list of Valid Redirect URIs`,
                                    `in the ${params.likelyCause.clientId} client configuration.\n`,
                                    `More info: https://docs.oidc-spa.dev/v/v5/resources/usage-with-keycloak`,
                                    `Silent SSO timed out after ${params.likelyCause.timeoutDelayMs}ms.`
                                ].join(" ");
                            case "not in Web Origins":
                                return [
                                    `It seems that there is a CORS issue.`,
                                    `If you are using Keycloak check the "Web Origins" option in your ${params.likelyCause.clientId} client configuration.`,
                                    `You should probably add "${location.origin}/*" to the list.`,
                                    `More info: https://docs.oidc-spa.dev/v/v5/resources/usage-with-keycloak`
                                ].join(" ");
                            case "oidc-callback.htm not properly served":
                                return [
                                    `${params.likelyCause.oidcCallbackHtmUrl} not properly served by your web server.`,
                                    (() => {
                                        switch (params.likelyCause.likelyCause) {
                                            case "the file hasn't been created":
                                                return "You probably forgot to create the silent-sso.htm file in the public directory.";
                                            case "serving another file":
                                                return [
                                                    "You probably forgot to create the `silent-sso.htm` file in the public directory.",
                                                    "If you did create it check the configuration of your web server, it's probably re-routing the GET request to silent-sso.htm",
                                                    "to another file. Likely your index.html"
                                                ].join(" ");
                                            case "using .html instead of .htm extension":
                                                return "You have probably upgraded from oidc-spa v4 to v5, in oidc-spa v5 the silent-sso file should have a .htm extension instead of .html";
                                        }
                                    })(),
                                    `Documentation: https://docs.oidc-spa.dev/v/v5/documentation/installation`
                                ].join(" ");
                            case "frame-ancestors none":
                                return [
                                    params.likelyCause.urls.hasDedicatedHtmFile
                                        ? `The oidc-callback.htm file, `
                                        : `The URI used for Silent SSO, `,
                                    `${params.likelyCause.urls.callbackUrl}, `,
                                    "is served by your web server with the HTTP header `Content-Security-Policy: frame-ancestors none` in the response.\n",
                                    "This header prevents the silent sign-in process from working.\n",
                                    "To fix this issue, you should configure your web server to not send this header or to use `frame-ancestors self` instead of `frame-ancestors none`.\n",
                                    "If you use Nginx, you can replace:\n",
                                    `add_header Content-Security-Policy "frame-ancestors 'none'";\n`,
                                    "with:\n",
                                    `map $uri $add_content_security_policy {\n`,
                                    `   "~*silent-sso\.html$" "frame-ancestors 'self'";\n`,
                                    `   default "frame-ancestors 'none'";\n`,
                                    `}\n`,
                                    `add_header Content-Security-Policy $add_content_security_policy;\n`
                                ].join(" ");
                        }
                    case "unknown":
                        return params.cause.message;
                }
                assert<Equals<typeof params, never>>(false);
            })(),
            // @ts-expect-error
            { "cause": params.type === "unknown" ? params.cause : undefined }
        );
        this.type = params.type;
        Object.setPrototypeOf(this, new.target.prototype);
    }
}

export async function diagnoseCantReachWellKnownOpenidConfiguration(): OidcInitializationError {}

export async function diagnoseSilentSignInError(params: {}): Promise<OidcInitializationError> {
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

                    return content.length < 1200 && content.includes("parent.postMessage(authResponse")
                        ? "ok"
                        : "reachable but wrong content";
                },
                () => "not reachable" as const
            );

        const status = await getHtmFileReachabilityStatus();

        if (status === "ok") {
            break oidc_callback_htm_unreachable;
        }

        return new OidcInitializationError({
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
        });
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
                return new Error(`Failed to fetch ${urls.callbackUrl}: ${csp.message}`);
            }

            return csp;
        })();

        if (csp instanceof Error) {
            return csp;
        }

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

        return new OidcInitializationError({
            "type": "bad configuration",
            "likelyCause": {
                "type": "frame-ancestors none",
                urls
            }
        });
    }

    // Here we know that the server is not down and that the issuer_uri is correct
    // otherwise we would have had a fetch error when loading the iframe.
    // So this means that it's very likely a OIDC client misconfiguration.
    // It could also be a very slow network but this risk is mitigated by the fact that we check
    // for the network speed to adjust the timeout delay.
    return new OidcInitializationError({
        "type": "bad configuration",
        "likelyCause": {
            "type": "misconfigured OIDC client",
            clientId,
            timeoutDelayMs,
            "callbackUrl": urls.callbackUrl
        }
    });
}
