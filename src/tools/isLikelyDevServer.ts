import { isBrowser } from "./isBrowser";

let isLikelyDevServer_cache: boolean | undefined = undefined;

const hasRefreshReg = isBrowser && "$RefreshReg$" in window;

export function getIsLikelyDevServer(): boolean {
    if (isLikelyDevServer_cache !== undefined) {
        return isLikelyDevServer_cache;
    }

    const isLikelyDevServer = (() => {
        if (hasRefreshReg) {
            return true;
        }

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
