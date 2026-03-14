import { assert } from "../tools/tsafe/assert";

let rootRelativeOriginalLocationHref: string | undefined = undefined;

export function getRootRelativeOriginalLocationHref_earlyInit() {
    assert(rootRelativeOriginalLocationHref !== undefined, "033");
    return rootRelativeOriginalLocationHref;
}

export function setGetRootRelativeOriginalLocationHref_earlyInit(params: {
    rootRelativeOriginalLocationHref: string;
}) {
    assert(rootRelativeOriginalLocationHref === undefined, "393");
    rootRelativeOriginalLocationHref = params.rootRelativeOriginalLocationHref;
}
