import type { AsyncStorage } from "../vendor/frontend/oidc-client-ts";
import { sessionStorageAdapter } from "../tools/sessionStorageAdapter";
import { localStorageAdapter } from "../tools/localStorageAdapter";
import type { BaseNavigatorWarning } from "./BaseNavigator";

const STORAGE_KEY_PREFIX = "oidc-spa:external-redirect-url:";
const SUPERSEDED_STORAGE_KEY_PREFIX = "oidc-spa:superseded-external-redirect-url:";
const MAX_AGE_MS = 15 * 60 * 1_000;

function isFresh(createdAt: number): boolean {
    const age = Date.now() - createdAt;
    return Number.isFinite(createdAt) && age >= 0 && age <= MAX_AGE_MS;
}

type PersistedExternalRedirectUrl = {
    url: string;
    createdAt: number;
    supersessionId?: string;
};

type ExternalRedirectUrlInMemory = {
    url: string;
    ts: number;
    isPersisted: boolean;
    needsProtectedStorageFallback?: boolean;
};

const externalRedirectUrlByConfigId_memory = new Map<string, ExternalRedirectUrlInMemory>();
const initializedConfigIds = new Set<string>();
const prExternalRedirectUrlInitializationByConfigId = new Map<string, Promise<string | undefined>>();

function getStorageKey(params: { configId: string }): string {
    const { configId } = params;

    return `${STORAGE_KEY_PREFIX}${configId}`;
}

function getSupersededStorageKey(params: { configId: string }): string {
    return `${SUPERSEDED_STORAGE_KEY_PREFIX}${params.configId}`;
}

export function initializeExternalRedirectUrl(params: {
    configId: string;
    prExternalRedirectUrl: Promise<string | undefined>;
    storageAdapter?: AsyncStorage;
    tokenStorageAdapter?: AsyncStorage;
    onWarning?: (warning: BaseNavigatorWarning) => void;
    /** Keep a cold-start callback in memory so protected token storage need not be unlocked first. */
    persistLaunchUrl?: boolean;
}): Promise<string | undefined> {
    const {
        configId,
        prExternalRedirectUrl,
        storageAdapter,
        tokenStorageAdapter,
        onWarning,
        persistLaunchUrl = true
    } = params;

    if (initializedConfigIds.has(configId)) {
        return prExternalRedirectUrlInitializationByConfigId.get(configId)!;
    }

    initializedConfigIds.add(configId);

    prExternalRedirectUrlInitializationByConfigId.set(
        configId,
        prExternalRedirectUrl
            .then(async url => {
                if (url === undefined) {
                    return undefined;
                }

                if (persistLaunchUrl) {
                    await setExternalRedirectUrl({ configId, url, storageAdapter, tokenStorageAdapter });
                } else {
                    externalRedirectUrlByConfigId_memory.set(configId, {
                        url,
                        ts: Date.now(),
                        isPersisted: false
                    });

                    try {
                        await (storageAdapter ?? localStorageAdapter).setItem(
                            getSupersededStorageKey({ configId }),
                            `${Date.now()}:${Math.random()}`
                        );
                    } catch {
                        externalRedirectUrlByConfigId_memory.set(configId, {
                            url,
                            ts: Date.now(),
                            isPersisted: false,
                            needsProtectedStorageFallback: true
                        });
                        onWarning?.({
                            code: "CAPACITOR_LAUNCH_URL_SUPERSESSION_FAILED",
                            message: "Failed to mark an older persisted redirect URL as superseded.",
                            configId
                        });

                        // The caller must unlock and scan storage before the callback can
                        // replace any older redirect record held there.
                        return undefined;
                    }
                }

                return url;
            })
            .catch(() => {
                onWarning?.({
                    code: "CAPACITOR_LAUNCH_URL_INIT_FAILED",
                    message: "Failed to resolve launch URL for native redirect initialization.",
                    configId
                });

                console.warn(
                    "oidc-spa: Failed to resolve launch URL for native redirect initialization."
                );

                return undefined;
            })
    );

    return prExternalRedirectUrlInitializationByConfigId.get(configId)!;
}

export async function waitForExternalRedirectUrlInitialization(params: {
    configId: string;
}): Promise<void> {
    const { configId } = params;

    await (prExternalRedirectUrlInitializationByConfigId.get(configId) ?? Promise.resolve());
}

export async function setExternalRedirectUrl(params: {
    configId: string;
    url: string | undefined;
    storageAdapter?: AsyncStorage;
    tokenStorageAdapter?: AsyncStorage;
}): Promise<void> {
    const { configId, url, storageAdapter, tokenStorageAdapter } = params;

    const adapter = tokenStorageAdapter ?? sessionStorageAdapter;
    const markerAdapter = storageAdapter ?? localStorageAdapter;
    const storageKey = getStorageKey({ configId });

    if (url === undefined) {
        externalRedirectUrlByConfigId_memory.delete(configId);
        await adapter.removeItem(storageKey);
        return;
    }

    // A failed replacement must not leave an older callback available to the memory fast path.
    externalRedirectUrlByConfigId_memory.delete(configId);

    const now = Date.now();
    const markerKey = getSupersededStorageKey({ configId });
    const newSupersessionId = `${now}:${Math.random()}`;
    let supersessionId: string | undefined = newSupersessionId;

    try {
        await markerAdapter.setItem(markerKey, newSupersessionId);
    } catch {
        // Without a marker, an older callback must be removed before a replacement is written.
        await adapter.removeItem(storageKey);
        supersessionId = undefined;
    }

    await adapter.setItem(
        storageKey,
        JSON.stringify({
            url,
            createdAt: now,
            supersessionId
        } satisfies PersistedExternalRedirectUrl)
    );

    externalRedirectUrlByConfigId_memory.set(configId, {
        url,
        ts: now,
        isPersisted: true
    });

    try {
        await markerAdapter.removeItem(markerKey);
    } catch {}
}

export async function peekExternalRedirectUrl(params: {
    configId: string;
    storageAdapter?: AsyncStorage;
    tokenStorageAdapter?: AsyncStorage;
    isValidForCurrentFlow?: (url: string) => Promise<boolean>;
}): Promise<string | undefined> {
    const { configId, storageAdapter, tokenStorageAdapter, isValidForCurrentFlow } = params;
    const markerAdapter = storageAdapter ?? localStorageAdapter;

    const returnIfValid = async (url: string) => {
        if (isValidForCurrentFlow !== undefined && !(await isValidForCurrentFlow(url))) {
            await clearExternalRedirectUrl({ configId, storageAdapter, tokenStorageAdapter });
            return undefined;
        }

        return url;
    };

    const externalRedirectUrl_memory = externalRedirectUrlByConfigId_memory.get(configId);

    if (externalRedirectUrl_memory !== undefined) {
        if (isFresh(externalRedirectUrl_memory.ts)) {
            if (externalRedirectUrl_memory.needsProtectedStorageFallback) {
                await setExternalRedirectUrl({
                    configId,
                    url: externalRedirectUrl_memory.url,
                    storageAdapter,
                    tokenStorageAdapter
                });
            }
            return returnIfValid(externalRedirectUrl_memory.url);
        }

        externalRedirectUrlByConfigId_memory.delete(configId);
    }

    const adapter = tokenStorageAdapter ?? sessionStorageAdapter;
    const storageKey = getStorageKey({ configId });

    const storedValue = await adapter.getItem(storageKey);

    if (storedValue === null || storedValue === undefined) {
        try {
            await markerAdapter.removeItem(getSupersededStorageKey({ configId }));
        } catch {}
        return undefined;
    }

    let parsedValue: unknown;

    try {
        parsedValue = JSON.parse(storedValue);
    } catch {
        await clearExternalRedirectUrl({ configId, storageAdapter, tokenStorageAdapter });
        return undefined;
    }

    if (
        !(parsedValue instanceof Object) ||
        !("url" in parsedValue) ||
        typeof parsedValue.url !== "string" ||
        !("createdAt" in parsedValue) ||
        typeof parsedValue.createdAt !== "number" ||
        ("supersessionId" in parsedValue &&
            parsedValue.supersessionId !== undefined &&
            typeof parsedValue.supersessionId !== "string")
    ) {
        await clearExternalRedirectUrl({ configId, storageAdapter, tokenStorageAdapter });
        return undefined;
    }

    if (!isFresh(parsedValue.createdAt)) {
        await clearExternalRedirectUrl({ configId, storageAdapter, tokenStorageAdapter });
        return undefined;
    }

    const persistedRedirect = parsedValue as PersistedExternalRedirectUrl;

    let supersessionId: string | null = null;

    try {
        supersessionId = await markerAdapter.getItem(getSupersededStorageKey({ configId }));
    } catch {
        // A failed marker read cannot distinguish a current warm redirect from
        // one superseded by a completed cold callback.
        return undefined;
    }

    if (supersessionId !== null) {
        if (persistedRedirect.supersessionId !== supersessionId) {
            try {
                await adapter.removeItem(storageKey);
                await markerAdapter.removeItem(getSupersededStorageKey({ configId }));
            } catch {}

            return undefined;
        }

        try {
            await markerAdapter.removeItem(getSupersededStorageKey({ configId }));
        } catch {}
    }

    externalRedirectUrlByConfigId_memory.set(configId, {
        url: persistedRedirect.url,
        ts: persistedRedirect.createdAt,
        isPersisted: true
    });

    return returnIfValid(persistedRedirect.url);
}

export async function clearExternalRedirectUrl(params: {
    configId: string;
    storageAdapter?: AsyncStorage;
    tokenStorageAdapter?: AsyncStorage;
}): Promise<void> {
    const { configId, storageAdapter, tokenStorageAdapter } = params;

    if (externalRedirectUrlByConfigId_memory.get(configId)?.isPersisted === false) {
        externalRedirectUrlByConfigId_memory.delete(configId);
        return;
    }

    await setExternalRedirectUrl({ configId, url: undefined, storageAdapter, tokenStorageAdapter });

    try {
        await (storageAdapter ?? localStorageAdapter).removeItem(getSupersededStorageKey({ configId }));
    } catch {}
}

export function cleanupExternalRedirectUrlContext(params: { configId: string }): void {
    const { configId } = params;

    externalRedirectUrlByConfigId_memory.delete(configId);
    initializedConfigIds.delete(configId);
    prExternalRedirectUrlInitializationByConfigId.delete(configId);
}
