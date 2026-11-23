let isCompatibilityMode = false;

export function enableCompatibilityModeHomeAsRedirectUri() {
    isCompatibilityMode = true;
}

export const REDIRECT_URI_RESERVED_PATH = "/openid-callback/";

export function getValidRedirectUri(params: { homeUrl: string }) {
    const { homeUrl } = params;

    if (isCompatibilityMode) {
        return homeUrl;
    }

    return `${homeUrl}${REDIRECT_URI_RESERVED_PATH.substring(1)}`;
}
