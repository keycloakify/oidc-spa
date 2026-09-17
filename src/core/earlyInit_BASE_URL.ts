import { assert } from "../tools/tsafe/assert";
import { getSharedState } from "./sharedScope";

const store_moduleScoped: { BASE_URL: string | undefined } = { BASE_URL: undefined };

// Shared across bundles, only one of them runs the init that sets this.
const getStore = () => getSharedState("BASE_URL_earlyInit", store_moduleScoped);

export function getBASE_URL_earlyInit() {
    return getStore().BASE_URL;
}

export function setBASE_URL_earlyInit(params: { BASE_URL: string }) {
    const store = getStore();

    assert(store.BASE_URL === undefined, "228");

    store.BASE_URL = params.BASE_URL;
}
