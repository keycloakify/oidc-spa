import { assert } from "../tools/tsafe/assert";

let ssr: boolean | undefined = undefined;

export function getSsr_earlyInit() {
    assert(ssr !== undefined, "111");
    return ssr;
}

export function setSsr_earlyInit(params: { ssr: boolean }) {
    assert(ssr === undefined, "228");
    ssr = params.ssr;
}
