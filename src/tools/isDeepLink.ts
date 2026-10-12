export function getIsDeepLink(params: { fullyQualifiedUrl: string; relativeTo_fullyQualified: string }) {
    const { fullyQualifiedUrl, relativeTo_fullyQualified } = params;

    const withTrailingSlash = (s: string) => (s.endsWith("/") ? s : `${s}/`);

    const target = new URL(withTrailingSlash(fullyQualifiedUrl));
    const relativeTo = new URL(withTrailingSlash(relativeTo_fullyQualified));

    if (target.origin !== relativeTo.origin) {
        return false;
    }

    return target.pathname.startsWith(relativeTo.pathname);
}
