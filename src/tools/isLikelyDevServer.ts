let isLikelyDevServer_cache: boolean | undefined = undefined;

export function getIsLikelyDevServer(): boolean {
    if (isLikelyDevServer_cache !== undefined) {
        return isLikelyDevServer_cache;
    }

    const isLikelyDevServer = (() => {
        const origin = window.location.origin;

        if (/^https?:\/\/localhost/.test(origin)) {
            return true;
        }

        if (/^https?:\/\/\[::\]/.test(origin)) {
            return true;
        }

        if (/^https?:\/\/127.0.0.1/.test(origin)) {
            return true;
        }

        return false;
    })();

    isLikelyDevServer_cache = isLikelyDevServer;

    return isLikelyDevServer;
}
