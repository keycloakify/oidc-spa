import { assert } from "../tools/tsafe/assert";
import type { AsyncStorage } from "../vendor/frontend/oidc-client-ts";
import { sessionStorageAdapter } from "./sessionStorageAdapter";

export type LazyAsyncSessionStorage = {
    length: Promise<number>;
    clear(): Promise<void>;
    getItem(key: string): Promise<string | null>;
    key(index: number): Promise<string | null>;
    removeItem(key: string): Promise<void>;
    setItem(key: string, value: string): Promise<void>;
    persistCurrentStateAndSubsequentChanges(): Promise<void>;
};

export const SESSION_STORAGE_GLOBAL_PREFIX = `oidc-spa:lazy-session-storage:`;

export async function createLazyAsyncSessionStorage(params: {
    storageId: string;
    persistenceStorage?: AsyncStorage;
}): Promise<LazyAsyncSessionStorage> {
    const { storageId, persistenceStorage } = params;

    const sessionStoragePrefix = `${SESSION_STORAGE_GLOBAL_PREFIX}${storageId}:`;

    const getSessionStorageKey = (key: string) => `${sessionStoragePrefix}${key}`;

    const entries: { key: string; value: string }[] = [];

    const sourceStorage = persistenceStorage ?? sessionStorageAdapter;

    const prefixedKeys: string[] = [];

    for (let i = 0; i < (await sourceStorage.length); i++) {
        const key = await sourceStorage.key(i);
        assert(key !== null, "470498");

        if (!key.startsWith(sessionStoragePrefix)) {
            continue;
        }

        prefixedKeys.push(key);
    }

    for (const key of prefixedKeys) {
        const value = await sourceStorage.getItem(key);

        if (value === null) {
            continue;
        }

        await sourceStorage.removeItem(key);

        entries.push({
            key: key.slice(sessionStoragePrefix.length),
            value
        });
    }

    let isPersistenceEnabled = false;

    const storage: LazyAsyncSessionStorage = {
        persistCurrentStateAndSubsequentChanges: async () => {
            isPersistenceEnabled = true;

            const keysSnapshot = entries.map(({ key }) => key);

            for (const key of keysSnapshot) {
                const value = await storage.getItem(key);

                if (value === null) {
                    continue;
                }

                await sourceStorage.setItem(getSessionStorageKey(key), value);
            }
        },
        get length() {
            return Promise.resolve(entries.length);
        },
        key: async index => {
            const entry = entries[index];

            if (entry === undefined) {
                return null;
            }

            return entry.key;
        },
        removeItem: async key => {
            const entry = entries.find(entry => entry.key === key);

            if (entry === undefined) {
                return;
            }

            await sourceStorage.removeItem(getSessionStorageKey(entry.key));

            const index = entries.indexOf(entry);

            if (index < 0) {
                return;
            }

            entries.splice(index, 1);
        },
        clear: async () => {
            const keysSnapshot = entries.map(({ key }) => key);

            for (const key of keysSnapshot) {
                await storage.removeItem(key);
            }
        },
        getItem: async key => {
            const entry = entries.find(entry => entry.key === key);
            if (entry === undefined) {
                return null;
            }
            return entry.value;
        },
        setItem: async (key, value) => {
            if (isPersistenceEnabled) {
                await sourceStorage.setItem(getSessionStorageKey(key), value);
            }

            update: {
                const entry = entries.find(entry => entry.key === key);

                if (entry === undefined) {
                    break update;
                }

                entry.value = value;

                return;
            }

            entries.push({ key, value });
        }
    };

    return storage;
}
