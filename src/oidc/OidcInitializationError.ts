import { assert } from "../vendor/frontend/tsafe";
import { getIsValidRemoteJson } from "../tools/getIsValidRemoteJson";

export class OidcInitializationError extends Error {
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
          adminConsoleUrl: string;
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
        "kcHttpRelativePath": kcHttpRelativePath === "" ? undefined : kcHttpRelativePath,
        "adminConsoleUrl": `${url.origin}${kcHttpRelativePath}/admin/${realm}/console`
    };
}

export async function createWellKnownOidcConfigurationEndpointUnreachableInitializationError(params: {
    issuerUri: string;
}): Promise<OidcInitializationError> {
    const { issuerUri } = params;

    const issuerUri_parsed = parseKeycloakIssuerUri(issuerUri);

    const WELL_KNOWN_PATH = "/.well-known/openid-configuration";

    const commonFallbackMessagePart = [
        `The OIDC server is either down or the issuerUri you provided is incorrect.`,
        `You provided the issuerUri: ${issuerUri}`,
        `Endpoint that couldn't be reached: ${issuerUri}${WELL_KNOWN_PATH}`
    ].join("\n");

    if (issuerUri_parsed === undefined) {
        return new OidcInitializationError({
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
            return new OidcInitializationError({
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
            return new OidcInitializationError({
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

    return new OidcInitializationError({
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

export async function createIframeTimeoutInitializationError(params: {
    hasDedicatedHtmFile: boolean;
    callbackUrl: string;
    issuerUri: string;
    clientId: string;
}): Promise<OidcInitializationError> {
    const { hasDedicatedHtmFile, callbackUrl, issuerUri, clientId } = params;

    oidc_callback_htm_unreachable: {
        if (!hasDedicatedHtmFile) {
            break oidc_callback_htm_unreachable;
        }

        const getHtmFileReachabilityStatus = async (ext?: "html") =>
            fetch(`${callbackUrl}${ext === "html" ? "l" : ""}`).then(
                async response => {
                    if (!response.ok) {
                        return "not reachable";
                    }

                    let content: string;

                    try {
                        content = await response.text();
                    } catch {
                        return "not reachable";
                    }

                    if (content.length > 1200 || !content.includes("parent.postMessage(authResponse")) {
                        return "reachable but does no contain the expected content";
                    }

                    return "seems ok";
                },
                () => "not reachable" as const
            );

        const status = await getHtmFileReachabilityStatus();

        if (status === "seems ok") {
            break oidc_callback_htm_unreachable;
        }

        if (status === "reachable but does no contain the expected content") {
            return new OidcInitializationError({
                "isAuthServerLikelyDown": false,
                "messageOrCause": [
                    "There is an issue with the content of the file oidc-callback.htm.",
                    `The url ${callbackUrl} does respond with a 200 status code but the content is not the expected one.`,
                    `You might have created the file in the public directory but it seems that your web server is serving another file instead.`,
                    `Check the configuration of you web server to see if it's not re-routing the GET request to something else like index.html.`
                ].join("\n")
            });
        }

        assert(status === "not reachable");

        const status_wrongExtension = await getHtmFileReachabilityStatus("html");

        if (status_wrongExtension === "seems ok") {
            return new OidcInitializationError({
                "isAuthServerLikelyDown": false,
                "messageOrCause": [
                    "You have created the file oidc-callback.html instead of oidc-callback.htm.",
                    "The expected extension is .htm not .html."
                ].join("\n")
            });
        }

        for (const legacyCallbackFileBasename of [".htm", ".html"].map(ext => `silent-sso${ext}`)) {
            const legacyCallbackUrl = callbackUrl.replace("silent-sso.htm", legacyCallbackFileBasename);

            const isPresent = await fetch(legacyCallbackUrl).then(
                async response => {
                    if (!response.ok) {
                        return false;
                    }

                    return true;
                },
                () => false
            );

            if (!isPresent) {
                continue;
            }

            return new OidcInitializationError({
                "isAuthServerLikelyDown": false,
                "messageOrCause": [
                    `In oidc-spa v6 is no longer using the ${legacyCallbackFileBasename} file.`,
                    `It is now oidc-callback.htm.`,
                    `Check the documentation: https://docs.oidc-spa.dev/v/v6`
                ].join("\n")
            });
        }

        return new OidcInitializationError({
            "isAuthServerLikelyDown": false,
            "messageOrCause": [
                `You seem to have forgotten to create the oidc-callback.htm file in the public directory.`,
                `${callbackUrl} is not reachable.`,
                `Check the documentation: https://docs.oidc-spa.dev/v/v6`
            ].join("\n")
        });
    }

    frame_ancestors_none: {
        const cspOrError = await fetch(callbackUrl).then(
            response => {
                if (!response.ok) {
                    return new Error(`${callbackUrl} responded with a ${response.status} status code.`);
                }

                return response.headers.get("Content-Security-Policy");
            },
            error => error
        );

        if (cspOrError instanceof Error) {
            return new OidcInitializationError({
                "isAuthServerLikelyDown": false,
                "messageOrCause": new Error(
                    `Unexpected error while trying to diagnose why the silent sign-in process timed out.`,
                    // @ts-expect-error
                    { "cause": cspOrError }
                )
            });
        }

        const csp = cspOrError;

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
            "isAuthServerLikelyDown": false,
            "messageOrCause": [
                hasDedicatedHtmFile ? `The oidc-callback.htm file,` : `The url used as OIDC callback,`,
                "is served by your web server with the HTTP header `Content-Security-Policy: frame-ancestors none` in the response.\n",
                "This header prevents the silent sign-in process from working.\n",
                "To fix this issue, you should configure your web server not to send this header or to use `frame-ancestors self` instead of `frame-ancestors none`.\n",
                "If you use Nginx, you can replace:\n",
                `add_header Content-Security-Policy "frame-ancestors 'none'";\n`,
                "with:\n",
                `map $uri $add_content_security_policy {\n`,
                `   "~*silent-sso\.html$" "frame-ancestors 'self'";\n`,
                `   default "frame-ancestors 'none'";\n`,
                `}\n`,
                `add_header Content-Security-Policy $add_content_security_policy;\n`,
                `\n`,
                `The url in question is: ${callbackUrl}`
            ].join(" ")
        });
    }

    // Here we know that the server is not down and that the issuer_uri is correct
    // otherwise we would have had a fetch error earlier on the well-known endpoint.
    // So this means that it's very likely a OIDC client misconfiguration.
    // It could also be a very slow network but this risk is mitigated by the fact that we check
    // for the network speed to adjust the timeout delay.
    return new OidcInitializationError({
        "isAuthServerLikelyDown": false,
        "messageOrCause": [
            `The silent sign-in process timed out.`,
            `Given the result of the diagnostic that oidc-spa just performed", 
            "the most likely cause of the issue is that you forgot to add the oidc callback URL to the list of Valid Redirect URIs.\n`,
            `The client id is: ${clientId}\n`,
            `The URL that should be added to the list of Valid Redirect URIs is: ${callbackUrl}\n\n`,
            ...(() => {
                const issuerUri_parsed = parseKeycloakIssuerUri(issuerUri);

                if (issuerUri_parsed === undefined) {
                    return [
                        "Checkout the documentation of the OIDC server you are using to see how to configure the client properly."
                    ];
                }

                return [
                    `Since it seems that you are using Keycloak, here are the steps to follow:\n`,
                    `- Go to the Keycloak admin console. ${issuerUri_parsed.adminConsoleUrl}/console\n`,
                    `- Log in as an admin user.\n`,
                    `- In the left menu, click on "Clients".\n`,
                    `- Find '${clientId}' in the list of clients and click on it.\n`,
                    `- Find 'Valid Redirect URIs' and add '${callbackUrl}' to the list.\n`,
                    `- Save the changes.\n\n`,
                    `More info: https://docs.oidc-spa.dev/v/v6/resources/usage-with-keycloak`
                ];
            })()
        ].join(" ")
    });
}

export function createFailedToFetchTokenEndpointInitializationError(params: {
    issuerUri: string;
    clientId: string;
}) {
    const { issuerUri, clientId } = params;

    return new OidcInitializationError({
        "isAuthServerLikelyDown": false,
        "messageOrCause": [
            "Failed to fetch the token endpoint.\n",
            "This is usually due to a CORS issue.\n",
            `Make sure you have added '${window.location.origin}' to the list of Web Origins`,
            `in the '${clientId}' client configuration of your OIDC server.\n`,
            "\n",
            ...(() => {
                const issuerUri_parsed = parseKeycloakIssuerUri(issuerUri);

                if (issuerUri_parsed === undefined) {
                    return [
                        "Checkout the documentation of the OIDC server you are using to see how to configure the client properly."
                    ];
                }

                return [
                    `Since it seems that you are using Keycloak, here are the steps to follow:\n`,
                    `- Go to the Keycloak admin console. ${issuerUri_parsed.adminConsoleUrl}\n`,
                    `- Log in as an admin user.\n`,
                    `- In the left menu, click on "Clients".\n`,
                    `- Find '${clientId}' in the list of clients and click on it.\n`,
                    `- Find 'Web Origins' and add '${window.location.origin}' to the list.\n`,
                    `- Save the changes.\n\n`,
                    `More info: https://docs.oidc-spa.dev/v/v6/resources/usage-with-keycloak`
                ];
            })()
        ].join(" ")
    });
}
