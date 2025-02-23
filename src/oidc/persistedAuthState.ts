import { assert } from "../vendor/frontend/tsafe";

function getKey(params: { configId: string }) {
    const { configId } = params;

    return `oidc-spa:auth-state:${configId}`;
}

type PersistedAuthState = "logged in" | "explicitly logged out";

export function persistAuthState(params: { configId: string; state: PersistedAuthState | undefined }) {
    const { configId, state } = params;

    const key = getKey({ configId });

    if (state === undefined) {
        localStorage.removeItem(key);
        return;
    }

    localStorage.setItem(key, state);
}

export function getPersistedAuthState(params: { configId: string }): PersistedAuthState | undefined {
    const { configId } = params;

    const value = localStorage.getItem(getKey({ configId }));

    if (value === null) {
        return undefined;
    }

    assert(value === "logged in" || value === "explicitly logged out");

    return value;
}
