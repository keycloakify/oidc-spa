function getKey(params: { configId: string }) {
    const { configId } = params;

    return `oidc-spa:is-logged-out:${configId}`;
}

export function persistLogoutState(params: { configId: string }) {
    const { configId } = params;

    const key = getKey({ configId });

    localStorage.setItem(key, "true");
}

export function clearPersistedLogoutState(params: { configId: string }) {
    const { configId } = params;

    const key = getKey({ configId });

    localStorage.removeItem(key);
}

export function getIsPersistedLogoutState(params: { configId: string }) {
    const { configId } = params;

    const key = getKey({ configId });

    return localStorage.getItem(key) === "true";
}
