import { assert } from "../tools/tsafe/assert";

const SESSION_STORAGE_PREFIX = "lazy-session-storage:";

export type LazySessionStorage = {
    // `Storage` methods, we don't use the type directly because it has [name: string]: any;
    readonly length: number;
    clear(): void;
    getItem(key: string): string | null;
    key(index: number): string | null;
    removeItem(key: string): void;
    setItem(key: string, value: string): void;

    // Custom method
    persistCurrentStateAndSubsequentChanges: () => void;
};

export function createLazySessionStorage(): LazySessionStorage {
    const entries: { key: string; value: string }[] = [];

    for (let i = 0; i < sessionStorage.length; i++) {
        const key = sessionStorage.key(i);
        assert(key !== null, "470498");

        if (!key.startsWith(SESSION_STORAGE_PREFIX)) {
            continue;
        }

        const value = sessionStorage.getItem(key);

        assert(value !== null, "846771");

        sessionStorage.removeItem(key);

        entries.push({
            key: key.slice(SESSION_STORAGE_PREFIX.length),
            value
        });
    }

    let isPersistenceEnabled = false;

    const storage: LazySessionStorage = {
        persistCurrentStateAndSubsequentChanges: () => {
            isPersistenceEnabled = true;

            for (let i = 0; i < storage.length; i++) {
                const key = storage.key(i);
                assert(key !== null, "803385");

                const value = storage.getItem(key);

                assert(value !== null, "777098");

                storage.setItem(key, value);
            }
        },
        get length() {
            return entries.length;
        },
        key: index => {
            const entry = entries[index];

            if (entry === undefined) {
                return null;
            }

            return entry.key;
        },
        removeItem: key => {
            const entry = entries.find(entry => entry.key === key);

            if (entry === undefined) {
                return;
            }

            sessionStorage.removeItem(`${SESSION_STORAGE_PREFIX}${entry.key}`);

            const index = entries.indexOf(entry);

            entries.splice(index, 1);
        },
        clear: () => {
            for (let i = 0; i < storage.length; i++) {
                const key = storage.key(i);
                assert(key !== null, "290875");
                storage.removeItem(key);
            }
        },
        getItem: key => {
            const entry = entries.find(entry => entry.key === key);
            if (entry === undefined) {
                return null;
            }
            return entry.value;
        },
        setItem: (key, value) => {
            if (isPersistenceEnabled) {
                sessionStorage.setItem(`${SESSION_STORAGE_PREFIX}${key}`, value);
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
