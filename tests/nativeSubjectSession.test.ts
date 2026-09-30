import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { test, vi } from "vitest";
import { createEvt } from "../src/tools/Evt";
import { createGetIsNewBrowserSession } from "../src/core/isNewBrowserSession";

test("native session tracking keeps the subject ID out of WebView sessionStorage", async () => {
    const browserEntries = new Map<string, string>();
    const protectedEntries = new Map<string, string>();
    vi.stubGlobal("window", { crypto: webcrypto });
    vi.stubGlobal("sessionStorage", {
        getItem: (key: string) => browserEntries.get(key) ?? null,
        setItem: (key: string, value: string) => browserEntries.set(key, value),
        removeItem: (key: string) => browserEntries.delete(key)
    });
    const storageAdapter = {
        get length() {
            return Promise.resolve(protectedEntries.size);
        },
        clear: async () => protectedEntries.clear(),
        key: async (index: number) => [...protectedEntries.keys()][index] ?? null,
        getItem: async (key: string) => protectedEntries.get(key) ?? null,
        setItem: async (key: string, value: string) => {
            protectedEntries.set(key, value);
        },
        removeItem: async (key: string) => {
            protectedEntries.delete(key);
        }
    };
    const evtInitializationOutcomeUserNotLoggedIn = createEvt<void>();

    try {
        const { getIsNewBrowserSession } = createGetIsNewBrowserSession({
            configId: "native-session-test",
            evtInitializationOutcomeUserNotLoggedIn,
            isNativeApp: true,
            storageAdapter
        });
        assert.equal(await getIsNewBrowserSession({ subjectId: "sensitive-subject-id" }), true);
        assert.equal(await getIsNewBrowserSession({ subjectId: "sensitive-subject-id" }), false);
        assert.equal(await getIsNewBrowserSession({ subjectId: "different-subject" }), true);
        assert.equal(JSON.stringify([...browserEntries]).includes("sensitive-subject-id"), false);
        assert.equal(JSON.stringify([...browserEntries]).includes("different-subject"), false);
        assert.equal(JSON.stringify([...protectedEntries]).includes("different-subject"), true);
    } finally {
        vi.unstubAllGlobals();
    }
});
