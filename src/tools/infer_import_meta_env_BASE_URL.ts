import { assert } from "./tsafe/assert";

export function infer_import_meta_env_BASE_URL() {
    const url = new URL(import.meta.url);
    const pathname = url.pathname;

    // In Vite builds, JS files live under `${BASE_URL}/assets/...`
    const assetsIndex = pathname.indexOf("/assets/");

    assert(assetsIndex !== -1);

    return pathname.slice(0, assetsIndex + 1); // keep trailing slash
}
