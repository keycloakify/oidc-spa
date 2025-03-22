import { toFullyQualifiedUrl } from "./toFullyQualifiedUrl";

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
    const url = new URL(issuerUri);

    const split = url.pathname.split("/realms/");

    if (split.length !== 2) {
        return undefined;
    }

    const [kcHttpRelativePath, realm] = split;

    const getAdminConsoleUrl = (realm: string) =>
        `${url.origin}${kcHttpRelativePath}/admin/${realm}/console`;

    return {
        origin: url.origin,
        realm,
        kcHttpRelativePath: kcHttpRelativePath === "" ? undefined : kcHttpRelativePath,
        adminConsoleUrl: getAdminConsoleUrl(realm),
        adminConsoleUrl_master: getAdminConsoleUrl("master"),
        getAccountUrl: ({ clientId, backToAppFromAccountUrl, locale }) => {
            const accountUrlObj = new URL(`${url.origin}${kcHttpRelativePath}/realms/${realm}/account`);
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
        }
    };
}
