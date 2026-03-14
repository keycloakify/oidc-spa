import { isKeycloak, createKeycloakUtils } from "../keycloak";

/**
 * Return undefined if the issuerUri doesn't match the expected shape of a Keycloak issuerUri
 *
 * Example:
 *
 * `parseKeycloakIssuerUri("https://auth.my-company.com/auth/realms/myrealm")` returns:
 * {
 *    origin: "https://auth.my-company.com",
 *    realm: "myrealm",
 *    kcHttpRelativePath: "/auth",
 *    adminConsoleUrl: "https://auth.my-company.com/auth/admin/myrealm/console",
 *    getAccountUrl: ({ thisAppDisplayName, backToAppFromAccountUrl }) =>
 *        `https://auth.my-company.com/auth/realms/myrealm/account?referrer=${thisAppDisplayName}&referrer_uri=${backToAppFromAccountUrl}`
 * }
 * */
export function parseKeycloakIssuerUri(issuerUri: string):
    | undefined
    | {
          origin: string;
          realm: string;
          /** If defined starts with / and end with no `/` */
          kcHttpRelativePath: string | undefined;
          adminConsoleUrl: string;
          adminConsoleUrl_master: string;
          getAccountUrl: (params: {
              clientId: string;
              backToAppFromAccountUrl: string;
              locale?: string;
          }) => string;
      } {
    if (!isKeycloak({ issuerUri })) {
        return undefined;
    }

    const keycloakUtils = createKeycloakUtils({ issuerUri });

    return {
        origin: keycloakUtils.issuerUriParsed.origin,
        realm: keycloakUtils.issuerUriParsed.realm,
        kcHttpRelativePath: keycloakUtils.issuerUriParsed.kcHttpRelativePath,
        adminConsoleUrl: keycloakUtils.adminConsoleUrl,
        adminConsoleUrl_master: keycloakUtils.adminConsoleUrl_master,
        getAccountUrl: ({ clientId, backToAppFromAccountUrl, locale }) =>
            keycloakUtils.getAccountUrl({
                clientId,
                validRedirectUri: backToAppFromAccountUrl,
                locale
            })
    };
}
