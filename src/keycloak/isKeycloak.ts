/**
 * Assume issuerUri with no trailing slashes
 */
export function isKeycloak(params: { issuerUri: string }): boolean {
    const { issuerUri } = params;

    const url = new URL(issuerUri);

    const split = url.pathname.split("/realms/");

    if (split.length !== 2) {
        return false;
    }

    const [, realm] = split;

    if (realm === "") {
        return false;
    }

    if (realm.includes("/")) {
        return false;
    }

    return true;
}
