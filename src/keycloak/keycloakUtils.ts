import { toFullyQualifiedUrl } from "../tools/toFullyQualifiedUrl";
import { type KeycloakIssuerUriParsed, parseKeycloakIssuerUri } from "./keycloakIssuerUriParsed";

export type KeycloakUtils = {
    issuerUriParsed: KeycloakIssuerUriParsed;
    adminConsoleUrl: string;
    adminConsoleUrl_master: string;
    getAccountUrl: (params: {
        clientId: string;
        backToAppFromAccountUrl: string;
        locale?: string;
    }) => string;
    fetchUserProfile: (params: { accessToken: string }) => Promise<KeycloakProfile>;
    fetchUserInfo: (params: { accessToken: string }) => Promise<KeycloakUserInfo>;
    transformUrlBeforeRedirectForRegister: (authorizationUrl: string) => string;
};

export type KeycloakProfile = {
    id?: string;
    username?: string;
    email?: string;
    firstName?: string;
    lastName?: string;
    enabled?: boolean;
    emailVerified?: boolean;
    totp?: boolean;
    createdTimestamp?: number;
    attributes?: Record<string, unknown>;
};

export type KeycloakUserInfo = {
    sub: string;
    [key: string]: any;
};

export function createKeycloakUtils(params: { issuerUri: string }): KeycloakUtils {
    const { issuerUri } = params;

    const issuerUriParsed = parseKeycloakIssuerUri({ issuerUri });

    const keycloakServerUrl = `${issuerUriParsed.origin}${issuerUriParsed.kcHttpRelativePath ?? ""}`;

    const getAdminConsoleUrl = (realm: string) =>
        `${keycloakServerUrl}/admin/${encodeURIComponent(realm)}/console`;

    const realmUrl = `${keycloakServerUrl}/realms/${encodeURIComponent(issuerUriParsed.realm)}`;

    return {
        issuerUriParsed,
        adminConsoleUrl: getAdminConsoleUrl(issuerUriParsed.realm),
        adminConsoleUrl_master: getAdminConsoleUrl("master"),
        getAccountUrl: ({ clientId, backToAppFromAccountUrl, locale }) => {
            const accountUrlObj = new URL(
                `${keycloakServerUrl}/realms/${issuerUriParsed.realm}/account`
            );
            accountUrlObj.searchParams.set("referrer", clientId);
            accountUrlObj.searchParams.set(
                "referrer_uri",
                toFullyQualifiedUrl({
                    urlish: backToAppFromAccountUrl,
                    doAssertNoQueryParams: false
                })
            );
            if (locale !== undefined) {
                accountUrlObj.searchParams.set("kc_locale", locale);
            }
            return accountUrlObj.href;
        },
        fetchUserProfile: ({ accessToken }) =>
            fetch(`${realmUrl}/account`, {
                headers: {
                    Accept: "application/json",
                    Authorization: `Bearer ${accessToken}`
                }
            }).then(r => r.json()),
        fetchUserInfo: ({ accessToken }) =>
            fetch(`${realmUrl}/protocol/openid-connect/userinfo`, {
                headers: {
                    Accept: "application/json",
                    Authorization: `Bearer ${accessToken}`
                }
            }).then(r => r.json()),
        transformUrlBeforeRedirectForRegister: authorizationUrl => {
            const urlObj = new URL(authorizationUrl);
            urlObj.pathname = urlObj.pathname.replace(/\/auth$/, "/registrations");
            return urlObj.href;
        }
    };
}
