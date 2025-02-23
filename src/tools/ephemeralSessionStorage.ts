import { assert, typeGuard, id } from "../vendor/frontend/tsafe";

type SessionStorageItem_Parsed = {
    __brand: typeof SessionStorageItem_Parsed.brand;
    value: string;
    expiresAtTime: number;
};

namespace SessionStorageItem_Parsed {
    export const brand = "SessionStorageItem_Parsed";
}

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
                json.__brand === SessionStorageItem_Parsed.brand
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
                __brand: "SessionStorageItem_Parsed",
                value,
                expiresAtTime: Date.now() + remainingTtlMs
            })
        )
    );

    return inMemoryItem;
}

export function createEphemeralSessionStorage(params: { sessionStorageTtlMs: number }): Storage {
    const { sessionStorageTtlMs } = params;

    const inMemoryItems: InMemoryItem[] = [];

    for (let i = 0; i < sessionStorage.length; i++) {
        const sessionStorageKey = sessionStorage.key(i);
        assert(sessionStorageKey !== null);

        if (!sessionStorageKey.startsWith(SESSION_STORAGE_PREFIX)) {
            continue;
        }

        const sessionStorageItem = sessionStorage.getItem(sessionStorageKey);

        assert(sessionStorageItem !== null);

        const sessionStorageItem_parsed = parseSessionStorageItem(sessionStorageItem);

        if (sessionStorageItem_parsed === undefined) {
            continue;
        }

        const remainingTtlMs = sessionStorageItem_parsed.expiresAtTime - Date.now();

        if (remainingTtlMs <= 0) {
            sessionStorage.removeItem(sessionStorageKey);
            continue;
        }

        inMemoryItems.push(
            createStoreInSessionStorageAndScheduleRemovalInMemoryItem({
                key: sessionStorageKey.slice(SESSION_STORAGE_PREFIX.length),
                value: sessionStorageItem_parsed.value,
                remainingTtlMs
            })
        );
    }

    const storage = {
        get length() {
            return inMemoryItems.length;
        },
        key(index: number) {
            const inMemoryItem = inMemoryItems[index];

            if (inMemoryItem === undefined) {
                return null;
            }

            return inMemoryItem.key;
        },
        removeItem(key: string) {
            const inMemoryItem = inMemoryItems.find(item => item.key === key);

            if (inMemoryItem === undefined) {
                return;
            }

            inMemoryItem.removeFromSessionStorage?.();

            const index = inMemoryItems.indexOf(inMemoryItem);

            inMemoryItems.splice(index, 1);
        },
        clear() {
            for (let i = 0; i < storage.length; i++) {
                const key = storage.key(i);
                assert(key !== null);
                storage.removeItem(key);
            }
        },
        getItem(key: string) {
            const inMemoryItem = inMemoryItems.find(item => item.key === key);
            if (inMemoryItem === undefined) {
                return null;
            }
            return inMemoryItem.value;
        },
        setItem(key: string, value: string) {
            let existingInMemoryItemIndex: number | undefined = undefined;

            {
                const inMemoryItem = inMemoryItems.find(item => item.key === key);

                if (inMemoryItem !== undefined) {
                    inMemoryItem.removeFromSessionStorage?.();
                    existingInMemoryItemIndex = inMemoryItems.indexOf(inMemoryItem);
                }
            }

            const inMemoryItem_new = createStoreInSessionStorageAndScheduleRemovalInMemoryItem({
                key,
                value,
                remainingTtlMs: sessionStorageTtlMs
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
