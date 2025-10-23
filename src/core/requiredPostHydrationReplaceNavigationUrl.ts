let rootRelativeRedirectUrl: string | undefined = undefined;

export function getOidcRequiredPostHydrationReplaceNavigationUrl() {
    return { rootRelativeRedirectUrl };
}

export function setOidcRequiredPostHydrationReplaceNavigationUrl(params: {
    rootRelativeRedirectUrl: string;
}) {
    rootRelativeRedirectUrl = params.rootRelativeRedirectUrl;
}
