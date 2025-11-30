import { OidcInitializationError } from "./OidcInitializationError";
import { isKeycloak, createKeycloakUtils } from "../keycloak";
import { getIsValidRemoteJson } from "../tools/getIsValidRemoteJson";
import { WELL_KNOWN_PATH } from "./OidcMetadata";
import { assert } from "../tools/tsafe/assert";
import { getDoMatchWildcardsPattern } from "../tools/wildcardsMatch";

export async function createWellKnownOidcConfigurationEndpointUnreachableInitializationError(params: {
    issuerUri: string;
}): Promise<OidcInitializationError> {
    const { issuerUri } = params;

    const commonFallbackMessagePart = [
        `The OIDC server is either down or the issuerUri you provided is incorrect.`,
        `You provided the issuerUri: ${issuerUri}`,
        `Endpoint that couldn't be reached: ${issuerUri}${WELL_KNOWN_PATH}`
    ].join("\n");

    if (!isKeycloak({ issuerUri })) {
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

    const keycloakUtils = createKeycloakUtils({ issuerUri });

    const getCandidateIssuerUri = (params: { kcHttpRelativePath: string | undefined }) => {
        const { kcHttpRelativePath } = params;

        return `${keycloakUtils.issuerUriParsed.origin}${
            kcHttpRelativePath ?? ""
        }/realms/${encodeURIComponent(keycloakUtils.issuerUriParsed.realm)}`;
    };

    if (keycloakUtils.issuerUriParsed.kcHttpRelativePath === undefined) {
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
                    `(You should remove the ${keycloakUtils.issuerUriParsed.kcHttpRelativePath} portion.)`
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
            `- Make sure the realm '${keycloakUtils.issuerUriParsed.realm}' exists.`,
            `- Check the KC_HTTP_RELATIVE_PATH that you might have configured your keycloak server with.`,
            `  For example if you have KC_HTTP_RELATIVE_PATH=/xxx the issuerUri should be ${getCandidateIssuerUri(
                { kcHttpRelativePath: "/xxx" }
            )}`
        ].join("\n"),
        isAuthServerLikelyDown: true
    });
}

export async function createIframeTimeoutInitializationError(params: {
    redirectUri: string;
    issuerUri: string;
    clientId: string;
    authorizationEndpointUrl: string;
}): Promise<OidcInitializationError> {
    const { redirectUri, issuerUri, clientId, authorizationEndpointUrl } = params;

    check_if_well_known_endpoint_is_reachable: {
        const isValid = await getIsValidRemoteJson(`${issuerUri}${WELL_KNOWN_PATH}`);

        if (isValid) {
            break check_if_well_known_endpoint_is_reachable;
        }

        return createWellKnownOidcConfigurationEndpointUnreachableInitializationError({ issuerUri });
    }

    // Investigate if framing was prevented by some header defined policies
    {
        const headersOrError = await fetch(redirectUri).then(
            response => {
                if (!response.ok) {
                    return new Error(`${redirectUri} responded with a ${response.status} status code.`);
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

        content_security_policy_issue: {
            const cspHeaderValue = headers["Content-Security-Policy"];

            if (cspHeaderValue === null) {
                break content_security_policy_issue;
            }

            const csp_parsed: Record<string, string[] | undefined> = Object.fromEntries(
                cspHeaderValue
                    .split(";")
                    .filter(part => part !== "")
                    .map(statement => {
                        const [directive, ...values] = statement.split(" ");
                        assert(directive !== undefined);
                        assert(values.length !== 0);
                        return [directive, values];
                    })
            );

            frame_src_issue: {
                const frameSrcValues = csp_parsed["frame-src"];

                if (frameSrcValues === undefined) {
                    break frame_src_issue;
                }

                const hasIssue = (() => {
                    for (const frameSrcValue of frameSrcValues) {
                        if (frameSrcValue === "'none'") {
                            return true;
                        }

                        const origin_authorizationEndpoint = new URL(authorizationEndpointUrl).origin;

                        if (frameSrcValue === "'self'") {
                            const origin_app = new URL(location.href).origin;

                            if (origin_app === origin_authorizationEndpoint) {
                                return false;
                            }
                        }

                        if (
                            getDoMatchWildcardsPattern({
                                candidate: origin_authorizationEndpoint,
                                stringWithWildcards: frameSrcValue
                            })
                        ) {
                            return false;
                        }
                    }

                    return true;
                })();

                if (!hasIssue) {
                    break frame_src_issue;
                }

                const recommendedValue = (() => {
                    const hostname_app = new URL(location.href).hostname;
                    const {
                        hostname: hostname_authorizationEndpoint,
                        origin: origin_authorizationEndpoint
                    } = new URL(authorizationEndpointUrl);

                    if (hostname_app === hostname_authorizationEndpoint) {
                        return "'self'";
                    }

                    const [lvl1, lvl2] = hostname_app.split(".").reverse();

                    if (!lvl2) {
                        return origin_authorizationEndpoint;
                    }

                    if (hostname_authorizationEndpoint.endsWith(`.${lvl2}.${lvl1}`)) {
                        return `https://*.${lvl2}.${lvl1}`;
                    }

                    return origin_authorizationEndpoint;
                })();

                return new OidcInitializationError({
                    isAuthServerLikelyDown: false,
                    messageOrCause: [
                        `Session restoration via iframe failed due to the following HTTP header on GET ${redirectUri}:`,
                        `\nContent-Security-Policy “frame-src”: ${frameSrcValues.join("; ")}`,
                        `\nThis header prevents opening an iframe to ${authorizationEndpointUrl}.`,
                        `\nTo fix this:`,
                        `\n  - Update your CSP to: frame-src ${[
                            ...frameSrcValues.filter(v => v !== "'none'"),
                            recommendedValue
                        ]}`,
                        `\n  - OR remove the frame-src directive from your CSP`,
                        `\n  - OR, if you cannot change your CSP, call bootstrapOidc/createOidc with sessionRestorationMethod: "full page redirect"`,
                        `\n\nMore info: https://docs.oidc-spa.dev/v/v8/resources/csp-configuration`
                    ].join(" ")
                });
            }

            frame_ancestor_issue: {
                const frameAncestorsValues = csp_parsed["frame-ancestors"];

                if (frameAncestorsValues === undefined) {
                    break frame_ancestor_issue;
                }

                const hasIssue =
                    frameAncestorsValues.includes("'none'") || !frameAncestorsValues.includes("'self'");

                if (!hasIssue) {
                    break frame_ancestor_issue;
                }

                return new OidcInitializationError({
                    isAuthServerLikelyDown: false,
                    messageOrCause: [
                        `Session restoration via iframe failed due to the following HTTP header on GET ${redirectUri}:`,
                        `\nContent-Security-Policy “frame-ancestors”: ${frameAncestorsValues.join(
                            "; "
                        )}`,
                        `\nThis header prevents your app from being iframed by itself.`,
                        `\nTo fix this:`,
                        `\n  - Update your CSP to: frame-ancestors 'self'`,
                        `\n  - OR remove the frame-ancestors directive from your CSP`,
                        `\n  - OR, if you cannot modify your CSP, call bootstrapOidc/createOidc with sessionRestorationMethod: "full page redirect"`,
                        `\n\nMore info: https://docs.oidc-spa.dev/v/v8/resources/csp-configuration`
                    ].join(" ")
                });
            }
        }

        x_frame_option_header_issue: {
            const key = "X-Frame-Options" as const;

            const value = headers[key];

            if (value === null) {
                break x_frame_option_header_issue;
            }

            const hasFrameAncestorsNone = value.toLowerCase().includes("deny");

            if (!hasFrameAncestorsNone) {
                break x_frame_option_header_issue;
            }

            return new OidcInitializationError({
                isAuthServerLikelyDown: false,
                messageOrCause: [
                    `Session restoration via iframe failed due to the following HTTP header on GET ${redirectUri}:`,
                    `\n${key}: ${value}`,
                    `\nThis header prevents your app from being framed by itself.`,
                    `\nTo fix this, remove the ${key} header and rely on Content-Security-Policy if you need to restrict framing.`,
                    `\n\nMore info: https://docs.oidc-spa.dev/v/v8/resources/csp-configuration`
                ].join(" ")
            });
        }
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
            `Callback URL to add to the list of Valid Redirect URIs: "${redirectUri}"\n\n`,
            ...(() => {
                if (!isKeycloak({ issuerUri })) {
                    return [
                        "Check the documentation of your OIDC server to learn how to configure the public client (Authorization Code Flow + PKCE) properly."
                    ];
                }

                const kc = createKeycloakUtils({ issuerUri });

                return [
                    `It seems you are using Keycloak. Follow these steps to resolve the issue:\n\n`,
                    `1. Go to the Keycloak admin console: ${kc.adminConsoleUrl_master}\n`,
                    `2. Log in as an admin user.\n`,
                    `3. In the top left corner select the realm "${kc.issuerUriParsed.realm}".\n`,
                    `4. In the left menu, click on "Clients".\n`,
                    `5. Locate the client "${clientId}" in the list and click on it.\n`,
                    `6. Find "Valid Redirect URIs" and add "${redirectUri}" to the list.\n`,
                    `7. Save the changes.\n\n`,
                    `For more information, refer to the documentation: https://docs.oidc-spa.dev/v/v8/providers-configuration/keycloak`
                ];
            })(),
            "\n\n",
            `If nothing works, or if you see in the console a message mentioning 'refused to frame' there might be a problem with your CSP.`,
            `Read more: https://docs.oidc-spa.dev/v/v8/resources/csp-configuration`
        ].join(" ")
    });
}

export async function createFailedToFetchTokenEndpointInitializationError(params: {
    issuerUri: string;
    clientId: string;
}) {
    const { issuerUri, clientId } = params;

    check_if_well_known_endpoint_is_reachable: {
        const isValid = await getIsValidRemoteJson(`${issuerUri}${WELL_KNOWN_PATH}`);

        if (isValid) {
            break check_if_well_known_endpoint_is_reachable;
        }

        return createWellKnownOidcConfigurationEndpointUnreachableInitializationError({ issuerUri });
    }

    return new OidcInitializationError({
        isAuthServerLikelyDown: false,
        messageOrCause: [
            "Failed to fetch the token endpoint.\n",
            "This is usually due to a CORS issue.\n",
            `Make sure you have added '${window.location.origin}' to the list of Web Origins`,
            `in the '${clientId}' client configuration of your OIDC server.\n`,
            "\n",
            ...(() => {
                if (!isKeycloak({ issuerUri })) {
                    return [
                        "Check the documentation of your OIDC server to learn how to configure the public client (Authorization Code Flow + PKCE) properly."
                    ];
                }

                const kc = createKeycloakUtils({ issuerUri });

                return [
                    `Since it seems that you are using Keycloak, here are the steps to follow:\n`,
                    `1. Go to the Keycloak admin console: ${kc.adminConsoleUrl_master}\n`,
                    `2. Log in as an admin user.\n`,
                    `3. In the top left corner select the realm "${kc.issuerUriParsed.realm}".\n`,
                    `4. In the left menu, click on "Clients".\n`,
                    `5. Find '${clientId}' in the list of clients and click on it.\n`,
                    `6. Find 'Web Origins' and add '${window.location.origin}' to the list.\n`,
                    `7. Save the changes.\n\n`,
                    `More info: https://docs.oidc-spa.dev/v/v8/providers-configuration/keycloak`
                ];
            })()
        ].join(" ")
    });
}
