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
          getAccountUrl: (params: { clientId: string; backToAppFromAccountUrl: string }) => string;
      } {
    const url = new URL(issuerUri);

    const split = url.pathname.split("/realms/");

    if (split.length !== 2) {
        return undefined;
    }

    const [kcHttpRelativePath, realm] = split;

    return {
        origin: url.origin,
        realm,
        kcHttpRelativePath: kcHttpRelativePath === "" ? undefined : kcHttpRelativePath,
        adminConsoleUrl: `${url.origin}${kcHttpRelativePath}/admin/${realm}/console`,
        getAccountUrl: ({ clientId, backToAppFromAccountUrl }) => {
            const accountUrlObj = new URL(`${url.origin}${kcHttpRelativePath}/realms/${realm}/account`);
            accountUrlObj.searchParams.set("referrer", clientId);
            accountUrlObj.searchParams.set("referrer_uri", backToAppFromAccountUrl);
            return accountUrlObj.href;
        }
    };
}
