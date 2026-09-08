import { assert } from "../tools/tsafe/assert";
import { getSharedState } from "./sharedScope";

const store_moduleScoped: { rootRelativeOriginalLocationHref: string | undefined } = {
    rootRelativeOriginalLocationHref: undefined
};

// Shared across bundles, only one of them runs the init that sets this.
const getStore = () =>
    getSharedState("rootRelativeOriginalLocationHref_earlyInit", store_moduleScoped);

export function getRootRelativeOriginalLocationHref_earlyInit() {
    const { rootRelativeOriginalLocationHref } = getStore();
    assert(rootRelativeOriginalLocationHref !== undefined, "033");
    return rootRelativeOriginalLocationHref;
}

export function setGetRootRelativeOriginalLocationHref_earlyInit(params: {
    rootRelativeOriginalLocationHref: string;
}) {
    const store = getStore();

    assert(store.rootRelativeOriginalLocationHref === undefined, "393");
    store.rootRelativeOriginalLocationHref = params.rootRelativeOriginalLocationHref;
}
