import { assert } from "../vendor/frontend/tsafe";
import { isKeycloak } from "./isKeycloak";

export type KeycloakIssuerUriParsed = {
    origin: string;
    realm: string;
    /** If defined starts with / and end with no `/` */
    kcHttpRelativePath: string | undefined;
};

export function parseKeycloakIssuerUri(params: { issuerUri: string }): KeycloakIssuerUriParsed {
    const { issuerUri } = params;

    assert(isKeycloak({ issuerUri }));

    const url = new URL(issuerUri);

    const split = url.pathname.split("/realms/");

    assert(split.length === 2);

    const [kcHttpRelativePath, realm] = split;

    return {
        origin: url.origin,
        realm,
        kcHttpRelativePath: kcHttpRelativePath === "" ? undefined : kcHttpRelativePath
    };
}
