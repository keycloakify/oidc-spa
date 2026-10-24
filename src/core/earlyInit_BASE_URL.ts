import { assert } from "../tools/tsafe/assert";

let BASE_URL: string | undefined = undefined;

let resolve_prBASE_URL_earlyInit_set: () => void;

export const prBASE_URL_earlyInit_set = new Promise<void>(
    resolve => (resolve_prBASE_URL_earlyInit_set = resolve)
);

/** Can return undefined if earlyInit has not yet ran */
export function getBASE_URL_earlyInit() {
    assert(BASE_URL !== undefined, "3022432");
    return BASE_URL;
}

export function setBASE_URL_earlyInit(params: { BASE_URL: string }) {
    assert(BASE_URL === undefined, "228");

    BASE_URL = params.BASE_URL;

    resolve_prBASE_URL_earlyInit_set();
}
