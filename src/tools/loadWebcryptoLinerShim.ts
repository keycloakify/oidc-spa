let prLoaded: Promise<void> | undefined = undefined;

export function loadWebcryptoLinerShim() {
    if (prLoaded !== undefined) {
        return prLoaded;
    }

    prLoaded = import("../vendor/frontend/webcrypto-liner-shim").then(() => {});

    return prLoaded;
}
