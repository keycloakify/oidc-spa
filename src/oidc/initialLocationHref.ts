const GLOBAL_CONTEXT_KEY = "__oidc-spa.initialLocationHref.globalContext";

declare global {
    interface Window {
        [GLOBAL_CONTEXT_KEY]: {
            initialLocationHref: string;
        };
    }
}

window[GLOBAL_CONTEXT_KEY] ??= {
    initialLocationHref: window.location.href
};

const globalContext = window[GLOBAL_CONTEXT_KEY];

export const { initialLocationHref } = globalContext;
