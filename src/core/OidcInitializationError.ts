import { getIsValidRemoteJson } from "../tools/getIsValidRemoteJson";
import { parseKeycloakIssuerUri } from "../tools/parseKeycloakIssuerUri";

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
            { cause: typeof params.messageOrCause === "string" ? undefined : params.messageOrCause }
        );
        this.isAuthServerLikelyDown = params.isAuthServerLikelyDown;
        Object.setPrototypeOf(this, new.target.prototype);
    }
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
            messageOrCause: [
                commonFallbackMessagePart,
                ``,
                `If you happen to be using Keycloak, be aware that the issuerUri you provided doesn't match the expected shape.`,
                `It should look like: https://<YOUR_KEYCLOAK_DOMAIN><KC_HTTP_RELATIVE_PATH>/realms/<YOUR_REALM>`,
                `Unless configured otherwise the KC_HTTP_RELATIVE_PATH is '/' by default on recent version of Keycloak.`
            ].join("\n"),
            isAuthServerLikelyDown: true
        });
    }

    const getCandidateIssuerUri = (params: { kcHttpRelativePath: string | undefined }) => {
        const { kcHttpRelativePath } = params;

        return `${issuerUri_parsed.origin}${
            kcHttpRelativePath === undefined ? "" : kcHttpRelativePath
        }/realms/${issuerUri_parsed.realm}`;
    };

    if (issuerUri_parsed.kcHttpRelativePath === undefined) {
        const issuerUri_candidate = getCandidateIssuerUri({ kcHttpRelativePath: "/auth" });

        const isValid = await getIsValidRemoteJson(`${issuerUri_candidate}${WELL_KNOWN_PATH}`);

        if (isValid) {
            return new OidcInitializationError({
                messageOrCause: [
                    `Your Keycloak server is configured with KC_HTTP_RELATIVE_PATH=/auth`,
                    `The issuerUri you provided: ${issuerUri}`,
                    `The correct issuerUri is: ${issuerUri_candidate}`,
                    `(You are missing the /auth portion)`
                ].join("\n"),
                isAuthServerLikelyDown: false
            });
        }
    } else {
        const issuerUri_candidate = getCandidateIssuerUri({ kcHttpRelativePath: undefined });

        const isValid = await getIsValidRemoteJson(`${issuerUri_candidate}${WELL_KNOWN_PATH}`);

        if (isValid) {
            return new OidcInitializationError({
                messageOrCause: [
                    `Your Keycloak server is configured with KC_HTTP_RELATIVE_PATH=/`,
                    `The issuerUri you provided: ${issuerUri}`,
                    `The correct issuerUri is: ${issuerUri_candidate}`,
                    `(You should remove the ${issuerUri_parsed.kcHttpRelativePath} portion.)`
                ].join("\n"),
                isAuthServerLikelyDown: false
            });
        }
    }

    return new OidcInitializationError({
        messageOrCause: [
            commonFallbackMessagePart,
            ``,
            `Given the shape of the issuerUri you provided, it seems that you are using Keycloak.`,
            `- Make sure the realm '${issuerUri_parsed.realm}' exists.`,
            `- Check the KC_HTTP_RELATIVE_PATH that you might have configured your keycloak server with.`,
            `  For example if you have KC_HTTP_RELATIVE_PATH=/xxx the issuerUri should be ${getCandidateIssuerUri(
                { kcHttpRelativePath: "/xxx" }
            )}`
        ].join("\n"),
        isAuthServerLikelyDown: true
    });
}

export async function createIframeTimeoutInitializationError(params: {
    callbackUri: string;
    issuerUri: string;
    clientId: string;
    noIframe: boolean;
}): Promise<OidcInitializationError> {
    const { callbackUri, issuerUri, clientId, noIframe } = params;

    iframe_blocked: {
        if (noIframe) {
            break iframe_blocked;
        }

        const headersOrError = await fetch(callbackUri).then(
            response => {
                if (!response.ok) {
                    return new Error(`${callbackUri} responded with a ${response.status} status code.`);
                }

                return {
                    "Content-Security-Policy": response.headers.get("Content-Security-Policy"),
                    "X-Frame-Options": response.headers.get("X-Frame-Options")
                };
            },
            (error: Error) => error
        );

        if (headersOrError instanceof Error) {
            return new OidcInitializationError({
                isAuthServerLikelyDown: false,
                messageOrCause: new Error(
                    `Unexpected error while trying to diagnose why the silent sign-in process timed out.`,
                    // @ts-expect-error
                    { cause: cspOrError }
                )
            });
        }

        const headers = headersOrError;

        let key_problem = (() => {
            block: {
                const key = "Content-Security-Policy" as const;

                const header = headers[key];

                if (header === null) {
                    break block;
                }

                const hasFrameAncestorsNone = header
                    .replace(/["']/g, "")
                    .replace(/\s+/g, " ")
                    .toLowerCase()
                    .includes("frame-ancestors none");

                if (!hasFrameAncestorsNone) {
                    break block;
                }

                return key;
            }

            block: {
                const key = "X-Frame-Options" as const;

                const header = headers[key];

                if (header === null) {
                    break block;
                }

                const hasFrameAncestorsNone = header.toLowerCase().includes("deny");

                if (!hasFrameAncestorsNone) {
                    break block;
                }

                return key;
            }

            return undefined;
        })();

        if (key_problem === undefined) {
            break iframe_blocked;
        }

        return new OidcInitializationError({
            isAuthServerLikelyDown: false,
            messageOrCause: [
                `${callbackUri} is currently served by your web server with the HTTP header \`${key_problem}: ${headers[key_problem]}\`.\n`,
                "This header prevents the silent sign-in process from working.\n",
                "Refer to this documentation page to fix this issue: https://docs.oidc-spa.dev/v/v6/resources/iframe-related-issues"
            ].join(" ")
        });
    }

    // Here we know that the server is not down and that the issuer_uri is correct
    // otherwise we would have had a fetch error earlier on the well-known endpoint.
    // So this means that it's very likely a OIDC client misconfiguration.
    // It could also be a very slow network but this risk is mitigated by the fact that we check
    // for the network speed to adjust the timeout delay.
    return new OidcInitializationError({
        isAuthServerLikelyDown: false,
        messageOrCause: [
            `The silent sign-in process timed out.\n`,
            `Based on the diagnostic performed by oidc-spa the more likely causes are:\n`,
            `- Either the client ID "${clientId}" does not exist, or\n`,
            `- You forgot to add the OIDC callback URL to the list of Valid Redirect URIs.\n`,
            `Client ID: "${clientId}"\n`,
            `Callback URL to add to the list of Valid Redirect URIs: "${callbackUri}"\n\n`,
            ...(() => {
                const kc = parseKeycloakIssuerUri(issuerUri);

                if (!kc) {
                    return [
                        "Check the documentation of your OIDC server to learn how to configure the public client (Authorization Code Flow + PKCE) properly."
                    ];
                }

                return [
                    `It seems you are using Keycloak. Follow these steps to resolve the issue:\n\n`,
                    `1. Go to the Keycloak admin console: ${kc.adminConsoleUrl_master}\n`,
                    `2. Log in as an admin user.\n`,
                    `3. In the top left corner select the realm "${kc.realm}".\n`,
                    `4. In the left menu, click on "Clients".\n`,
                    `5. Locate the client "${clientId}" in the list and click on it.\n`,
                    `6. Find "Valid Redirect URIs" and add "${callbackUri}" to the list.\n`,
                    `7. Save the changes.\n\n`,
                    `For more information, refer to the documentation: https://docs.oidc-spa.dev/v/v6/providers-configuration/keycloak`
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
        isAuthServerLikelyDown: false,
        messageOrCause: [
            "Failed to fetch the token endpoint.\n",
            "This is usually due to a CORS issue.\n",
            `Make sure you have added '${window.location.origin}' to the list of Web Origins`,
            `in the '${clientId}' client configuration of your OIDC server.\n`,
            "\n",
            ...(() => {
                const kc = parseKeycloakIssuerUri(issuerUri);

                if (kc === undefined) {
                    return [
                        "Check the documentation of your OIDC server to learn how to configure the public client (Authorization Code Flow + PKCE) properly."
                    ];
                }

                return [
                    `Since it seems that you are using Keycloak, here are the steps to follow:\n`,
                    `1. Go to the Keycloak admin console: ${kc.adminConsoleUrl_master}\n`,
                    `2. Log in as an admin user.\n`,
                    `3. In the top left corner select the realm "${kc.realm}".\n`,
                    `4. In the left menu, click on "Clients".\n`,
                    `5. Find '${clientId}' in the list of clients and click on it.\n`,
                    `6. Find 'Web Origins' and add '${window.location.origin}' to the list.\n`,
                    `7. Save the changes.\n\n`,
                    `More info: https://docs.oidc-spa.dev/v/v6/providers-configuration/keycloak`
                ];
            })()
        ].join(" ")
    });
}
