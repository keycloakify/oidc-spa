export function inferIsViteDev() {
    const url = new URL(import.meta.url);
    const pathname = url.pathname;

    return pathname.includes("/node_modules/");
}
