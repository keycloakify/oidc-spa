let postLoginRedirectUrl: string | undefined;

export function setDesiredPostLoginRedirectUrl(params: { postLoginRedirectUrl: string | undefined }) {
    postLoginRedirectUrl = params.postLoginRedirectUrl;
}

export function getDesiredPostLoginRedirectUrl() {
    return postLoginRedirectUrl;
}
