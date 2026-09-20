import { getIsDeepLink } from "./isDeepLink";
import { assert } from "./tsafe/assert";

export function deepLinkToRootRelativeUrl(params: { fullyQualifiedDeepLinkUrl: string }) {
    const { fullyQualifiedDeepLinkUrl } = params;

    assert(
        getIsDeepLink({ fullyQualifiedUrl: fullyQualifiedDeepLinkUrl }),
        `${fullyQualifiedDeepLinkUrl} is not a deep link`
    );

    return fullyQualifiedDeepLinkUrl.slice(window.location.origin.length);
}
