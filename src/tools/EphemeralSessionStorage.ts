import { assert, typeGuard, id } from "../vendor/frontend/tsafe";

type SessionStorageItem_Parsed = {
    __brand: "SessionStorageItem_Parsed-v1";
    value: string;
    expiresAtTime: number;
};

function parseSessionStorageItem(
    sessionStorageItemValue: string
): SessionStorageItem_Parsed | undefined {
    let json: unknown;

    try {
        json = JSON.parse(sessionStorageItemValue);
    } catch {
        return undefined;
    }

    if (
        !typeGuard<SessionStorageItem_Parsed>(
            json,
            json instanceof Object &&
                "__brand" in json &&
                json.__brand === id<SessionStorageItem_Parsed["__brand"]>("SessionStorageItem_Parsed-v1")
        )
    ) {
        return undefined;
    }

    return json;
}

type InMemoryItem = {
    key: string;
    value: string;
    removeFromSessionStorage: (() => void) | undefined;
};

const SESSION_STORAGE_PREFIX = "ephemeral:";

function createStoreInSessionStorageAndScheduleRemovalInMemoryItem(params: {
    key: string;
    value: string;
    remainingTtlMs: number;
}): InMemoryItem {
    const { key, value, remainingTtlMs } = params;

    const sessionStorageKey = `${SESSION_STORAGE_PREFIX}${key}`;

    const removeFromSessionStorage = () => {
        inMemoryItem.removeFromSessionStorage = undefined;
        clearTimeout(timer);
        sessionStorage.removeItem(sessionStorageKey);
    };

    const timer = setTimeout(() => removeFromSessionStorage(), remainingTtlMs);

    const inMemoryItem: InMemoryItem = {
        key,
        value,
        removeFromSessionStorage
    };

    sessionStorage.removeItem(sessionStorageKey);

    sessionStorage.setItem(
        sessionStorageKey,
        JSON.stringify(
            id<SessionStorageItem_Parsed>({
                __brand: "SessionStorageItem_Parsed-v1",
                value,
                expiresAtTime: Date.now() + remainingTtlMs
            })
        )
    );

    return inMemoryItem;
}

export type EphemeralSessionStorage = {
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

export function createEphemeralSessionStorage(params: {
    sessionStorageTtlMs: number;
}): EphemeralSessionStorage {
    const { sessionStorageTtlMs } = params;

    const inMemoryItems: InMemoryItem[] = [];

    for (let i = 0; i < sessionStorage.length; i++) {
        const sessionStorageKey = sessionStorage.key(i);
        assert(sessionStorageKey !== null, "470498");

        if (!sessionStorageKey.startsWith(SESSION_STORAGE_PREFIX)) {
            continue;
        }

        const sessionStorageItem = sessionStorage.getItem(sessionStorageKey);

        assert(sessionStorageItem !== null, "846771");

        const sessionStorageItem_parsed = parseSessionStorageItem(sessionStorageItem);

        if (sessionStorageItem_parsed === undefined) {
            continue;
        }

        const remainingTtlMs = sessionStorageItem_parsed.expiresAtTime - Date.now();

        sessionStorage.removeItem(sessionStorageKey);

        if (remainingTtlMs <= 0) {
            continue;
        }

        inMemoryItems.push({
            key: sessionStorageKey.slice(SESSION_STORAGE_PREFIX.length),
            value: sessionStorageItem_parsed.value,
            removeFromSessionStorage: undefined
        });
    }

    let isPersistenceEnabled = false;

    const storage: EphemeralSessionStorage = {
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
            return inMemoryItems.length;
        },
        key: index => {
            const inMemoryItem = inMemoryItems[index];

            if (inMemoryItem === undefined) {
                return null;
            }

            return inMemoryItem.key;
        },
        removeItem: key => {
            const inMemoryItem = inMemoryItems.find(item => item.key === key);

            if (inMemoryItem === undefined) {
                return;
            }

            inMemoryItem.removeFromSessionStorage?.();

            const index = inMemoryItems.indexOf(inMemoryItem);

            inMemoryItems.splice(index, 1);
        },
        clear: () => {
            for (let i = 0; i < storage.length; i++) {
                const key = storage.key(i);
                assert(key !== null, "290875");
                storage.removeItem(key);
            }
        },
        getItem: key => {
            const inMemoryItem = inMemoryItems.find(item => item.key === key);
            if (inMemoryItem === undefined) {
                return null;
            }
            return inMemoryItem.value;
        },
        setItem: (key, value) => {
            let existingInMemoryItemIndex: number | undefined = undefined;

            {
                const inMemoryItem = inMemoryItems.find(item => item.key === key);

                if (inMemoryItem !== undefined) {
                    inMemoryItem.removeFromSessionStorage?.();
                    existingInMemoryItemIndex = inMemoryItems.indexOf(inMemoryItem);
                }
            }

            const inMemoryItem_new = isPersistenceEnabled
                ? createStoreInSessionStorageAndScheduleRemovalInMemoryItem({
                      key,
                      value,
                      remainingTtlMs: sessionStorageTtlMs
                  })
                : id<InMemoryItem>({
                      key,
                      value,
                      removeFromSessionStorage: undefined
                  });

            if (existingInMemoryItemIndex !== undefined) {
                inMemoryItems[existingInMemoryItemIndex] = inMemoryItem_new;
            } else {
                inMemoryItems.push(inMemoryItem_new);
            }
        }
    };

    return storage;
}
