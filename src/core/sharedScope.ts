const WINDOW_KEY = "__oidc_spa_shared__";

// Bumped on incompatible changes, a bundle seeing another format falls back to module scope.
const FORMAT_VERSION = 1;

type SharedStore = {
    formatVersion: number;
    isEnabled: boolean;
    state: Record<string, unknown>;
};

// Sharing requires this bundle's own opt in, so a bundle that never passed the flag keeps its
// module scoped state even when another bundle on the page enabled the store.
let isEnabledInThisBundle = false;

// Reading never creates the store, only enableSharedScope does.
function peekStore(): SharedStore | undefined {
    if (typeof window === "undefined") {
        return undefined;
    }

    const store = (window as any)[WINDOW_KEY] as SharedStore | undefined;

    if (store !== undefined && store.formatVersion !== FORMAT_VERSION) {
        console.warn(
            [
                "oidc-spa: Another bundle on this page shares oidc state with format",
                `${store.formatVersion}, this bundle expects ${FORMAT_VERSION}.`,
                "Falling back to module scoped state for this bundle,",
                "align the oidc-spa versions across your micro-frontends."
            ].join(" ")
        );
        return undefined;
    }

    return store;
}

/** Moves oidc-spa's global state to `window` so every bundle on the page shares it. */
export function enableSharedScope(): void {
    if (typeof window === "undefined") {
        return;
    }

    const store = ((window as any)[WINDOW_KEY] ??= {
        formatVersion: FORMAT_VERSION,
        isEnabled: false,
        state: {}
    }) as SharedStore;

    if (store.formatVersion !== FORMAT_VERSION) {
        return;
    }

    isEnabledInThisBundle = true;

    if (store.isEnabled) {
        return;
    }

    store.isEnabled = true;

    console.warn(
        [
            "oidc-spa: Shared scope enabled.",
            "OIDC state is accessible to all scripts on this page.",
            "Only use this in trusted micro-frontend environments."
        ].join(" ")
    );
}

export function getIsSharedScopeEnabled(): boolean {
    return isEnabledInThisBundle && (peekStore()?.isEnabled ?? false);
}

/**
 * Shared instance of `obj` when enabled (first bundle donates, the rest adopt), otherwise `obj`.
 * Call at use time, a module scope capture races against oidcEarlyInit enabling the scope.
 */
export function getSharedState<T extends object>(key: string, obj: T): T {
    const store = peekStore();

    if (!isEnabledInThisBundle || store === undefined || !store.isEnabled) {
        return obj;
    }

    return (store.state[key] ??= obj) as T;
}
