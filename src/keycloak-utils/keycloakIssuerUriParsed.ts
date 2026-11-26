import { assert } from "../tools/tsafe/assert";
import { isKeycloak } from "./isKeycloak";

export type KeycloakIssuerUriParsed = {
    origin: string;
    realm: string;
    /** If defined starts with / and end with no `/` */
    kcHttpRelativePath: string | undefined;
};

export function parseKeycloakIssuerUri(params: { issuerUri: string }): KeycloakIssuerUriParsed {
    const { issuerUri } = params;

    if (!isKeycloak({ issuerUri })) {
        throw new Error(
            [
                `oidc-spa: The issuer uri provided ${issuerUri}`,
                "if you are in an environnement that should support multiple",
                "auth provider, you should first test `isKeycloakUrl({ issuerUri })`",
                "before calling parseKeycloakIssuerUri({ issuerUri })"
            ].join(" ")
        );
    }

    const url = new URL(issuerUri.replace(/\/$/, ""));

    const split = url.pathname.split("/realms/");

    assert(split.length === 2);

    const [kcHttpRelativePath, realm] = split;

    return {
        origin: url.origin,
        realm,
        kcHttpRelativePath: kcHttpRelativePath === "" ? undefined : kcHttpRelativePath
    };
}
