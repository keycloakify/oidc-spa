import { assert } from "./tsafe/assert";

export function infer_import_meta_env_BASE_URL() {
    const url = new URL(import.meta.url);
    const pathname = url.pathname;

    for (const searched of ["/assets/", "/node_modules/.vite/"]) {
        // In Vite builds, JS files live under `${BASE_URL}/assets/...`
        const index = pathname.indexOf(searched);

        if (index === -1) {
            continue;
        }

        return pathname.slice(0, index + 1); // keep trailing slash
    }

    assert(false, "Couldn't infer import.meta.BASE_URL");
}
