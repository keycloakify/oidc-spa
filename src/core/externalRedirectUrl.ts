import type { AsyncStorage } from "../vendor/frontend/oidc-client-ts";
import { sessionStorageAdapter } from "../tools/sessionStorageAdapter";
import type { BaseNavigatorWarning } from "./BaseNavigator";

const STORAGE_KEY_PREFIX = "oidc-spa:external-redirect-url:";
const MAX_AGE_MS = 15 * 60 * 1_000;

type PersistedExternalRedirectUrl = {
    url: string;
    createdAt: number;
};

const externalRedirectUrlByConfigId_memory = new Map<string, string>();
const initializedConfigIds = new Set<string>();
const prExternalRedirectUrlInitializationByConfigId = new Map<string, Promise<void>>();

function getStorageKey(params: { configId: string }): string {
    const { configId } = params;

    return `${STORAGE_KEY_PREFIX}${configId}`;
}

export function initializeExternalRedirectUrl(params: {
    configId: string;
    prExternalRedirectUrl: Promise<string | undefined>;
    tokenStorageAdapter?: AsyncStorage;
    onWarning?: (warning: BaseNavigatorWarning) => void;
}): void {
    const { configId, prExternalRedirectUrl, tokenStorageAdapter, onWarning } = params;

    if (initializedConfigIds.has(configId)) {
        return;
    }

    initializedConfigIds.add(configId);

    prExternalRedirectUrlInitializationByConfigId.set(
        configId,
        prExternalRedirectUrl
            .then(async url => {
                if (url === undefined) {
                    return;
                }

                await setExternalRedirectUrl({ configId, url, tokenStorageAdapter });
            })
            .catch(error => {
                const errorDetails =
                    error instanceof Error
                        ? {
                              errorName: error.name,
                              errorMessage: error.message
                          }
                        : {};

                onWarning?.({
                    code: "CAPACITOR_LAUNCH_URL_INIT_FAILED",
                    message: "Failed to resolve launch URL for native redirect initialization.",
                    configId,
                    ...errorDetails
                });

                console.warn(
                    "oidc-spa: Failed to resolve launch URL for native redirect initialization.",
                    errorDetails
                );
            })
    );
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
    tokenStorageAdapter?: AsyncStorage;
}): Promise<void> {
    const { configId, url, tokenStorageAdapter } = params;

    const adapter = tokenStorageAdapter ?? sessionStorageAdapter;
    const storageKey = getStorageKey({ configId });

    if (url === undefined) {
        externalRedirectUrlByConfigId_memory.delete(configId);
        await adapter.removeItem(storageKey);
        return;
    }

    externalRedirectUrlByConfigId_memory.set(configId, url);

    await adapter.setItem(
        storageKey,
        JSON.stringify({
            url,
            createdAt: Date.now()
        } satisfies PersistedExternalRedirectUrl)
    );
}

export async function peekExternalRedirectUrl(params: {
    configId: string;
    tokenStorageAdapter?: AsyncStorage;
}): Promise<string | undefined> {
    const { configId, tokenStorageAdapter } = params;

    const externalRedirectUrl_memory = externalRedirectUrlByConfigId_memory.get(configId);

    if (externalRedirectUrl_memory !== undefined) {
        return externalRedirectUrl_memory;
    }

    const adapter = tokenStorageAdapter ?? sessionStorageAdapter;
    const storageKey = getStorageKey({ configId });
    const storedValue = await adapter.getItem(storageKey);

    if (storedValue === null || storedValue === undefined) {
        return undefined;
    }

    let parsedValue: unknown;

    try {
        parsedValue = JSON.parse(storedValue);
    } catch {
        await clearExternalRedirectUrl({ configId, tokenStorageAdapter });
        return undefined;
    }

    if (
        !(parsedValue instanceof Object) ||
        !("url" in parsedValue) ||
        typeof parsedValue.url !== "string" ||
        !("createdAt" in parsedValue) ||
        typeof parsedValue.createdAt !== "number"
    ) {
        await clearExternalRedirectUrl({ configId, tokenStorageAdapter });
        return undefined;
    }

    if (Date.now() - parsedValue.createdAt > MAX_AGE_MS) {
        await clearExternalRedirectUrl({ configId, tokenStorageAdapter });
        return undefined;
    }

    externalRedirectUrlByConfigId_memory.set(configId, parsedValue.url);

    return parsedValue.url;
}

export async function clearExternalRedirectUrl(params: {
    configId: string;
    tokenStorageAdapter?: AsyncStorage;
}): Promise<void> {
    const { configId, tokenStorageAdapter } = params;

    await setExternalRedirectUrl({ configId, url: undefined, tokenStorageAdapter });
}

export function cleanupExternalRedirectUrlContext(params: { configId: string }): void {
    const { configId } = params;

    externalRedirectUrlByConfigId_memory.delete(configId);
    initializedConfigIds.delete(configId);
    prExternalRedirectUrlInitializationByConfigId.delete(configId);
}
