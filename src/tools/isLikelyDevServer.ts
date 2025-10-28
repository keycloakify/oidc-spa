export function getIsLikelyDevServer(): boolean {
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
}
