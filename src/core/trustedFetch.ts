const globalContext = {
    trustedFetch: window.fetch
};

export const { trustedFetch } = globalContext;

export function captureFetch() {
    /** noop */
}
