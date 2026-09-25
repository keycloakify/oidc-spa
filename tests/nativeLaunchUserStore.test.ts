import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { test, vi } from "vitest";
import type { NativeAuthorizationRequest } from "../src/capacitor/CapacitorNavigator";
import type { BaseNavigatorWarning } from "../src/core/BaseNavigator";

let launchUrl: string | undefined;
let appUrlOpenListener: ((event: { url: string }) => Promise<void>) | undefined;
let browserOpenCalls: string[] = [];
let browserOpenError: Error | undefined;
let browserListenerRemovals = 0;
let appListenerRemovals = 0;
const localEntries = new Map<string, string>();
const testGlobals = globalThis as unknown as { window?: unknown };

vi.stubGlobal("localStorage", {
    get length() {
        return localEntries.size;
    },
    clear: () => {
        localEntries.clear();
    },
    key: (index: number) => [...localEntries.keys()][index] ?? null,
    getItem: key => localEntries.get(key) ?? null,
    setItem: (key, value) => {
        localEntries.set(key, value);
    },
    removeItem: key => {
        localEntries.delete(key);
    }
});

vi.mock("@capacitor/app", () => ({
    App: {
        getLaunchUrl: async () => ({ url: launchUrl }),
        addListener: async (eventName: string, listener: (event: { url: string }) => Promise<void>) => {
            if (eventName === "appUrlOpen") appUrlOpenListener = listener;
            return {
                remove() {
                    appListenerRemovals++;
                }
            };
        }
    }
}));
vi.mock("@capacitor/browser", () => ({
    Browser: {
        addListener: async () => ({
            remove() {
                browserListenerRemovals++;
            }
        }),
        close: async () => {},
        open: async ({ url }: { url: string }) => {
            browserOpenCalls.push(url);
            if (browserOpenError !== undefined) throw browserOpenError;
        }
    }
}));
vi.mock("@capacitor/core", () => ({
    Capacitor: { getPlatform: async () => "android" }
}));

const { CapacitorNavigator } = await import("../src/capacitor/CapacitorNavigator");
const { UserManager, WebStorageStateStore, InMemoryWebStorage } = await import(
    "../src/vendor/frontend/oidc-client-ts"
);
const { createLazyAsyncSessionStorage } = await import("../src/tools/lazyAsyncSessionStorage");
const {
    cleanupExternalRedirectUrlContext,
    peekExternalRedirectUrl,
    clearExternalRedirectUrl,
    setExternalRedirectUrl
} = await import("../src/core/externalRedirectUrl");

const callbackUrl = "myapp://auth-callback";
const callbackWithCode = `${callbackUrl}?code=code&state=b2lkYy1zcGEu${"a".repeat(20)}`;

function deferred() {
    let resolve!: () => void;
    const promise = new Promise<void>(done => {
        resolve = done;
    });
    return { promise, resolve };
}

function makeStorage(configId: string, { outbound = false, locked = false } = {}) {
    const userKey = `oidc-spa:lazy-session-storage:${configId}:oidc.user:issuer:client`;
    const entries = new Map([[userKey, "persisted-user"]]);
    if (outbound) {
        entries.set("outbound-proof", "non-authorizing-proof");
    }
    const operations: string[] = [];
    let isLocked = locked;

    return {
        entries,
        operations,
        unlock() {
            isLocked = false;
        },
        async clear() {
            if (isLocked) throw new Error("PIN required");
            entries.clear();
        },
        get length() {
            operations.push("length");
            if (isLocked) throw new Error("PIN required");
            return Promise.resolve(entries.size);
        },
        async key(index) {
            operations.push("key");
            return [...entries.keys()][index] ?? null;
        },
        async getItem(key) {
            operations.push("getItem");
            return entries.get(key) ?? null;
        },
        async removeItem(key) {
            operations.push("removeItem");
            if (isLocked) throw new Error("PIN required");
            entries.delete(key);
        },
        async setItem(key, value) {
            operations.push("setItem");
            if (isLocked) throw new Error("PIN required");
            entries.set(key, value);
        }
    };
}

async function start(
    configId: string,
    storage: ReturnType<typeof makeStorage>,
    onWarning?: (warning: BaseNavigatorWarning) => void,
    { hasValidState = true } = {}
) {
    const navigator = new CapacitorNavigator({ callbackUrlPolicy: "strict" });
    const hasAcceptedLaunchCallback =
        (await navigator.initialize({
            tokenStorageAdapter: storage,
            configId,
            callbackUrl,
            isValidForCurrentFlow: async () => hasValidState,
            onWarning,
            onAuthFlowAborted: () => {}
        })) === true;
    const hasValidLaunchCallback =
        hasAcceptedLaunchCallback &&
        (await peekExternalRedirectUrl({
            configId,
            tokenStorageAdapter: storage,
            isValidForCurrentFlow: async () => hasValidState
        })) !== undefined;
    const userStore = await createLazyAsyncSessionStorage({
        storageId: configId,
        persistenceStorage: storage,
        skipInitialLoad: hasValidLaunchCallback
    });
    await userStore.persistCurrentStateAndSubsequentChanges();
    return userStore;
}

test("accepted cold-start callback bypasses protected user-store storage", async () => {
    const configId = "native-accepted";
    const storage = makeStorage(configId, { outbound: true, locked: true });
    launchUrl = callbackWithCode;

    try {
        const userStore = await start(configId, storage);
        assert.equal(await userStore.getItem("oidc.user:issuer:client"), null);
        assert.equal(
            await peekExternalRedirectUrl({
                configId,
                tokenStorageAdapter: storage,
                isValidForCurrentFlow: async () => true
            }),
            callbackWithCode
        );
        await clearExternalRedirectUrl({ configId, tokenStorageAdapter: storage });
        assert.deepEqual(storage.operations, []);
        assert.equal(storage.entries.get("outbound-proof"), "non-authorizing-proof");
    } finally {
        cleanupExternalRedirectUrlContext({ configId });
    }
});

test("opted-in navigator waits for an accepted cold callback write", async () => {
    const configId = "native-opt-in-cold";
    const storage = makeStorage(configId);
    const writeStarted = deferred();
    const writeGate = deferred();
    const originalSetItem = storage.setItem;
    const redirectKey = `oidc-spa:external-redirect-url:${configId}`;
    let settled = false;
    let writtenValue;
    storage.setItem = async (key, value) => {
        writtenValue = { key, value };
        writeStarted.resolve();
        await writeGate.promise;
        await originalSetItem(key, value);
    };
    launchUrl = callbackWithCode;

    try {
        const navigator = new CapacitorNavigator({
            callbackUrlPolicy: "strict",
            persistAcceptedLaunchCallbackToTokenStorage: true
        });
        const initialized = navigator
            .initialize({
                tokenStorageAdapter: storage,
                configId,
                callbackUrl,
                isValidForCurrentFlow: async () => true,
                onAuthFlowAborted: () => {}
            })
            .then(value => {
                settled = true;
                return value;
            });

        assert.equal(
            await Promise.race([
                writeStarted.promise.then(() => "write"),
                new Promise(resolve => setTimeout(() => resolve("timeout"), 100))
            ]),
            "write"
        );
        assert.equal(settled, false);
        assert.equal(writtenValue.key, redirectKey);
        assert.equal(JSON.parse(writtenValue.value).url, callbackWithCode);
        writeGate.resolve();

        assert.equal(await initialized, true);
        assert.equal(storage.operations.includes("length"), false);
        assert.equal(storage.entries.has(redirectKey), true);
    } finally {
        writeGate.resolve();
        cleanupExternalRedirectUrlContext({ configId });
    }
});

test("opted-in navigator does not persist a blocked or non-OIDC launch URL", async () => {
    for (const [suffix, url] of [
        ["blocked", `otherapp://auth-callback?code=secret&state=b2lkYy1zcGEu${"a".repeat(20)}`],
        ["non-oidc", `${callbackUrl}?other=page`]
    ]) {
        const configId = `native-opt-in-${suffix}`;
        const storage = makeStorage(configId);
        launchUrl = url;
        const originalWarn = console.warn;
        console.warn = () => {};

        try {
            const navigator = new CapacitorNavigator({
                callbackUrlPolicy: "strict",
                persistAcceptedLaunchCallbackToTokenStorage: true
            });
            assert.equal(
                await navigator.initialize({
                    tokenStorageAdapter: storage,
                    configId,
                    callbackUrl,
                    onAuthFlowAborted: () => {}
                }),
                false
            );
            assert.equal(storage.operations.includes("setItem"), false);
        } finally {
            console.warn = originalWarn;
            cleanupExternalRedirectUrlContext({ configId });
        }
    }
});

test("failed opted-in callback write fails closed without leaking the URL", async () => {
    const configId = "native-opt-in-write-failed";
    const storage = makeStorage(configId, { outbound: true });
    const secretCallback = `${callbackUrl}?code=private-code&state=b2lkYy1zcGEu${"a".repeat(20)}`;
    const warnings: unknown[] = [];
    const consoleWarnings: unknown[] = [];
    const originalWarn = console.warn;
    console.warn = (...args) => consoleWarnings.push(args);
    storage.setItem = async () => {
        throw new Error(`write failed: ${secretCallback}`);
    };
    launchUrl = secretCallback;

    try {
        const navigator = new CapacitorNavigator({
            callbackUrlPolicy: "strict",
            persistAcceptedLaunchCallbackToTokenStorage: true
        });
        assert.equal(
            await navigator.initialize({
                tokenStorageAdapter: storage,
                configId,
                callbackUrl,
                isValidForCurrentFlow: async () => true,
                onWarning: warning => warnings.push(warning),
                onAuthFlowAborted: () => {}
            }),
            false
        );
        const operationsBeforePeek = storage.operations.length;
        assert.equal(
            await peekExternalRedirectUrl({ configId, tokenStorageAdapter: storage }),
            undefined
        );
        assert.ok(
            storage.operations.length > operationsBeforePeek,
            "peek must read storage, not memory"
        );
        assert.equal(storage.operations.at(-1), "getItem");
        assert.equal(
            (
                await createLazyAsyncSessionStorage({
                    storageId: configId,
                    persistenceStorage: storage
                })
            ).getItem !== undefined,
            true
        );
        assert.ok(storage.operations.includes("length"));
        assert.equal(JSON.stringify({ warnings, consoleWarnings }).includes(secretCallback), false);
    } finally {
        console.warn = originalWarn;
        cleanupExternalRedirectUrlContext({ configId });
    }
});

test("app-icon start with outbound proof loads persisted user", async () => {
    const configId = "native-icon";
    const storage = makeStorage(configId, { outbound: true });
    launchUrl = undefined;

    try {
        const userStore = await start(configId, storage);
        assert.equal(await userStore.getItem("oidc.user:issuer:client"), "persisted-user");
        assert.equal(storage.operations[0], "length");
        assert.equal(storage.entries.get("outbound-proof"), "non-authorizing-proof");
    } finally {
        cleanupExternalRedirectUrlContext({ configId });
    }
});

test("ordinary native start loads persisted user", async () => {
    const configId = "native-ordinary";
    const storage = makeStorage(configId);
    launchUrl = undefined;

    try {
        const userStore = await start(configId, storage);
        assert.equal(await userStore.getItem("oidc.user:issuer:client"), "persisted-user");
        assert.equal(storage.operations[0], "length");
    } finally {
        cleanupExternalRedirectUrlContext({ configId });
    }
});

test("callback rejected by real navigator policy loads persisted user", async () => {
    const configId = "native-blocked";
    const storage = makeStorage(configId, { outbound: true });
    launchUrl = `otherapp://auth-callback?code=code&state=b2lkYy1zcGEu${"a".repeat(20)}`;
    const warnings: BaseNavigatorWarning[] = [];
    const originalWarn = console.warn;
    console.warn = () => {};

    try {
        const userStore = await start(configId, storage, warning => warnings.push(warning));
        assert.equal(await userStore.getItem("oidc.user:issuer:client"), "persisted-user");
        assert.equal(warnings[0]?.code, "CAPACITOR_CALLBACK_URL_BLOCKED");
    } finally {
        console.warn = originalWarn;
        cleanupExternalRedirectUrlContext({ configId });
    }
});

test("policy-accepted callback with invalid OIDC state restores the persisted user", async () => {
    const configId = "native-invalid-state";
    const storage = makeStorage(configId, { outbound: true });
    launchUrl = callbackWithCode;

    try {
        const userStore = await start(configId, storage, undefined, { hasValidState: false });
        assert.equal(storage.operations[0], "length");
        assert.equal(await userStore.getItem("oidc.user:issuer:client"), "persisted-user");
        assert.equal(
            await peekExternalRedirectUrl({ configId, tokenStorageAdapter: storage }),
            undefined
        );
    } finally {
        cleanupExternalRedirectUrlContext({ configId });
    }
});

test("stale persisted callback is discarded before local user restoration", async () => {
    const configId = "native-stale";
    const storage = makeStorage(configId, { outbound: true });
    const redirectKey = `oidc-spa:external-redirect-url:${configId}`;
    storage.entries.set(redirectKey, JSON.stringify({ url: callbackWithCode, createdAt: Date.now() }));
    launchUrl = undefined;

    try {
        const userStore = await start(configId, storage);
        const pendingUrl = await peekExternalRedirectUrl({
            configId,
            tokenStorageAdapter: storage,
            isValidForCurrentFlow: async () => false
        });

        assert.equal(pendingUrl, undefined);
        assert.equal(storage.entries.has(redirectKey), false);
        assert.equal(await userStore.getItem("oidc.user:issuer:client"), "persisted-user");
    } finally {
        cleanupExternalRedirectUrlContext({ configId });
    }
});

test("a callback record dated in the future is removed instead of retained", async () => {
    const configId = "native-future-callback";
    const storage = makeStorage(configId);
    const redirectKey = `oidc-spa:external-redirect-url:${configId}`;
    storage.entries.set(
        redirectKey,
        JSON.stringify({ url: callbackWithCode, createdAt: Date.now() + 60_000 })
    );

    try {
        assert.equal(
            await peekExternalRedirectUrl({ configId, tokenStorageAdapter: storage }),
            undefined
        );
        assert.equal(storage.entries.has(redirectKey), false);
    } finally {
        cleanupExternalRedirectUrlContext({ configId });
    }
});

test("a newer cold callback supersedes an older persisted but still valid warm callback", async () => {
    const configId = "native-superseded";
    const storage = makeStorage(configId, { outbound: true, locked: true });
    const oldCallback = `${callbackUrl}?code=old&state=b2lkYy1zcGEu${"b".repeat(20)}`;
    const redirectKey = `oidc-spa:external-redirect-url:${configId}`;
    storage.entries.set(redirectKey, JSON.stringify({ url: oldCallback, createdAt: Date.now() }));
    launchUrl = callbackWithCode;

    try {
        await start(configId, storage);
        await clearExternalRedirectUrl({ configId, tokenStorageAdapter: storage });
        assert.deepEqual(storage.operations, []);

        cleanupExternalRedirectUrlContext({ configId });
        storage.unlock();
        launchUrl = undefined;
        const userStore = await start(configId, storage);
        const pendingUrl = await peekExternalRedirectUrl({
            configId,
            tokenStorageAdapter: storage,
            isValidForCurrentFlow: async () => true
        });

        assert.equal(pendingUrl, undefined);
        assert.equal(storage.entries.has(redirectKey), false);
        assert.equal(await userStore.getItem("oidc.user:issuer:client"), "persisted-user");
    } finally {
        cleanupExternalRedirectUrlContext({ configId });
    }
});

test("native storage adapter keeps a cold callback marker when WebView localStorage is evicted", async () => {
    const configId = "native-durable-supersession";
    const tokenStorage = makeStorage(configId, { outbound: true, locked: true });
    const markerStorage = makeStorage(`${configId}-marker`);
    const markerKey = `oidc-spa:superseded-external-redirect-url:${configId}`;
    const redirectKey = `oidc-spa:external-redirect-url:${configId}`;
    const oldCallback = `${callbackUrl}?code=old&state=b2lkYy1zcGEu${"f".repeat(20)}`;
    tokenStorage.entries.set(redirectKey, JSON.stringify({ url: oldCallback, createdAt: Date.now() }));
    launchUrl = callbackWithCode;

    try {
        const navigator = new CapacitorNavigator({ callbackUrlPolicy: "strict" });
        assert.equal(
            await navigator.initialize({
                configId,
                callbackUrl,
                tokenStorageAdapter: tokenStorage,
                storageAdapter: markerStorage,
                isValidForCurrentFlow: async () => true
            }),
            true
        );
        assert.equal(markerStorage.entries.has(markerKey), true);
        assert.equal(localEntries.has(markerKey), false);

        await clearExternalRedirectUrl({
            configId,
            tokenStorageAdapter: tokenStorage,
            storageAdapter: markerStorage
        });
        localEntries.clear();
        cleanupExternalRedirectUrlContext({ configId });
        tokenStorage.unlock();
        launchUrl = undefined;

        assert.equal(
            await peekExternalRedirectUrl({
                configId,
                tokenStorageAdapter: tokenStorage,
                storageAdapter: markerStorage,
                isValidForCurrentFlow: async () => true
            }),
            undefined
        );
        assert.equal(tokenStorage.entries.has(redirectKey), false);
    } finally {
        cleanupExternalRedirectUrlContext({ configId });
    }
});

test("a later warm callback supersedes the cold-start marker", async () => {
    const configId = "native-warm-after-cold";
    const storage = makeStorage(configId);
    const warmCallback = `${callbackUrl}?code=warm&state=b2lkYy1zcGEu${"c".repeat(20)}`;
    launchUrl = callbackWithCode;

    try {
        await start(configId, storage);
        await clearExternalRedirectUrl({ configId, tokenStorageAdapter: storage });
        await setExternalRedirectUrl({ configId, url: warmCallback, tokenStorageAdapter: storage });

        cleanupExternalRedirectUrlContext({ configId });
        assert.equal(
            await peekExternalRedirectUrl({ configId, tokenStorageAdapter: storage }),
            warmCallback
        );
    } finally {
        cleanupExternalRedirectUrlContext({ configId });
    }
});

test("a persisted warm callback survives a crash before its cold marker is removed", async () => {
    const configId = "native-warm-crash-window";
    const storage = makeStorage(configId);
    const warmCallback = `${callbackUrl}?code=warm&state=b2lkYy1zcGEu${"d".repeat(20)}`;
    const markerKey = `oidc-spa:superseded-external-redirect-url:${configId}`;
    const removeItem = global.localStorage.removeItem;
    launchUrl = callbackWithCode;

    try {
        await start(configId, storage);
        await clearExternalRedirectUrl({ configId, tokenStorageAdapter: storage });
        global.localStorage.removeItem = key => {
            if (key === markerKey) throw new Error("process stopped before marker removal");
            return removeItem(key);
        };
        await setExternalRedirectUrl({ configId, url: warmCallback, tokenStorageAdapter: storage });
        global.localStorage.removeItem = removeItem;

        cleanupExternalRedirectUrlContext({ configId });
        assert.equal(
            await peekExternalRedirectUrl({ configId, tokenStorageAdapter: storage }),
            warmCallback
        );
    } finally {
        global.localStorage.removeItem = removeItem;
        cleanupExternalRedirectUrlContext({ configId });
    }
});

test("failed cold marker write falls back to protected storage and replaces an older callback", async () => {
    const configId = "native-marker-write-failed";
    const storage = makeStorage(configId, { outbound: true });
    const redirectKey = `oidc-spa:external-redirect-url:${configId}`;
    const markerKey = `oidc-spa:superseded-external-redirect-url:${configId}`;
    const olderCallback = `${callbackUrl}?code=older&state=b2lkYy1zcGEu${"e".repeat(20)}`;
    const warnings: BaseNavigatorWarning[] = [];
    storage.entries.set(redirectKey, JSON.stringify({ url: olderCallback, createdAt: Date.now() }));
    const setItem = global.localStorage.setItem;
    global.localStorage.setItem = (key, value) => {
        if (key === markerKey) throw new Error(`localStorage unavailable: ${callbackWithCode}`);
        return setItem(key, value);
    };
    launchUrl = callbackWithCode;

    try {
        await start(configId, storage, warning => warnings.push(warning));
        assert.equal(storage.operations[0], "length");
        assert.equal(
            await peekExternalRedirectUrl({
                configId,
                tokenStorageAdapter: storage,
                isValidForCurrentFlow: async () => true
            }),
            callbackWithCode
        );
        assert.equal(JSON.parse(storage.entries.get(redirectKey)!).url, callbackWithCode);
        assert.equal(JSON.stringify(warnings).includes(callbackWithCode), false);
    } finally {
        global.localStorage.setItem = setItem;
        cleanupExternalRedirectUrlContext({ configId });
    }
});

test("appUrlOpen still persists the callback and reloads the webview", async () => {
    const configId = "native-warm";
    const storage = makeStorage(configId);
    const navigator = new CapacitorNavigator({ callbackUrlPolicy: "strict" });
    let reloads = 0;
    testGlobals.window = { location: { reload: () => reloads++ } };
    launchUrl = undefined;

    try {
        await navigator.initialize({
            tokenStorageAdapter: storage,
            configId,
            callbackUrl,
            isValidForCurrentFlow: async () => true,
            onAuthFlowAborted: () => {}
        });
        await navigator.prepare({});
        await appUrlOpenListener!({ url: callbackWithCode });

        assert.equal(reloads, 1);
        assert.equal(
            JSON.parse(storage.entries.get(`oidc-spa:external-redirect-url:${configId}`)!).url,
            callbackWithCode
        );
        cleanupExternalRedirectUrlContext({ configId });
        assert.equal(
            await peekExternalRedirectUrl({ configId, tokenStorageAdapter: storage }),
            callbackWithCode
        );
    } finally {
        delete testGlobals.window;
        appUrlOpenListener = undefined;
        cleanupExternalRedirectUrlContext({ configId });
    }
});

test("unknown warm callback leaves the active login open for its real callback", async () => {
    const configId = "native-warm-unknown-state";
    const storage = makeStorage(configId);
    const navigator = new CapacitorNavigator({ callbackUrlPolicy: "strict" });
    const fakeCallback = `${callbackUrl}?code=fake&state=b2lkYy1zcGEu${"b".repeat(20)}`;
    const initialListenerRemovals = appListenerRemovals;
    let reloads = 0;
    testGlobals.window = { location: { reload: () => reloads++ } };
    launchUrl = undefined;

    try {
        await navigator.initialize({
            tokenStorageAdapter: storage,
            configId,
            callbackUrl,
            isValidForCurrentFlow: async url => url === callbackWithCode
        });
        await navigator.prepare({});

        await appUrlOpenListener!({ url: fakeCallback });
        assert.equal(reloads, 0);
        assert.equal(storage.operations.includes("setItem"), false);
        assert.equal(appListenerRemovals, initialListenerRemovals);

        await appUrlOpenListener!({ url: callbackWithCode });
        assert.equal(reloads, 1);
        assert.equal(
            JSON.parse(storage.entries.get(`oidc-spa:external-redirect-url:${configId}`)!).url,
            callbackWithCode
        );
    } finally {
        delete testGlobals.window;
        appUrlOpenListener = undefined;
        cleanupExternalRedirectUrlContext({ configId });
    }
});

test("overlapping valid native callbacks persist only the first arrival", async () => {
    const configId = "native-concurrent-callbacks";
    const storage = makeStorage(configId);
    const navigator = new CapacitorNavigator({ callbackUrlPolicy: "strict" });
    const firstCallback = `${callbackUrl}?code=first&state=b2lkYy1zcGEu${"a".repeat(20)}`;
    const secondCallback = `${callbackUrl}?code=second&state=b2lkYy1zcGEu${"a".repeat(20)}`;
    const firstValidationStarted = deferred();
    const releaseFirstValidation = deferred();
    let reloads = 0;
    testGlobals.window = { location: { reload: () => reloads++ } };
    launchUrl = undefined;

    try {
        await navigator.initialize({
            tokenStorageAdapter: storage,
            configId,
            callbackUrl,
            isValidForCurrentFlow: async url => {
                if (url === firstCallback) {
                    firstValidationStarted.resolve();
                    await releaseFirstValidation.promise;
                }
                return true;
            }
        });
        await navigator.prepare({});

        const first = appUrlOpenListener!({ url: firstCallback });
        await firstValidationStarted.promise;
        const second = appUrlOpenListener!({ url: secondCallback });
        releaseFirstValidation.resolve();
        await Promise.all([first, second]);

        assert.equal(reloads, 1);
        assert.equal(
            JSON.parse(storage.entries.get(`oidc-spa:external-redirect-url:${configId}`)!).url,
            firstCallback
        );
    } finally {
        delete testGlobals.window;
        appUrlOpenListener = undefined;
        cleanupExternalRedirectUrlContext({ configId });
    }
});

test("native warnings do not forward plugin error messages containing authorization data", async () => {
    const configId = "native-warning-redaction";
    const storage = makeStorage(configId);
    const secret = "secret-state-in-plugin-error";
    const warnings: BaseNavigatorWarning[] = [];
    const originalWarn = console.warn;
    console.warn = () => {};
    browserOpenError = new Error(`Browser.open failed for ${secret}`);
    launchUrl = undefined;

    try {
        const navigator = new CapacitorNavigator();
        await navigator.initialize({
            tokenStorageAdapter: storage,
            configId,
            callbackUrl,
            onWarning: warning => warnings.push(warning)
        });
        const prepared = await navigator.prepare({});
        await assert.rejects(prepared.navigate({ url: "https://issuer.example/auth" }));
        assert.equal(warnings.at(-1)?.code, "CAPACITOR_NAVIGATE_OPEN_FAILED");
        assert.equal(JSON.stringify(warnings).includes(secret), false);
    } finally {
        browserOpenError = undefined;
        console.warn = originalWarn;
        cleanupExternalRedirectUrlContext({ configId });
    }
});

test("blocked callback warnings omit a secret in the callback path", async () => {
    const configId = "native-warning-path";
    const storage = makeStorage(configId);
    const secret = "secret-in-callback-path";
    const warnings: BaseNavigatorWarning[] = [];
    const originalWarn = console.warn;
    console.warn = () => {};
    launchUrl = `${callbackUrl}/${secret}?code=code&state=b2lkYy1zcGEu${"a".repeat(20)}`;

    try {
        const navigator = new CapacitorNavigator({ callbackUrlPolicy: "strict" });
        await navigator.initialize({
            tokenStorageAdapter: storage,
            configId,
            callbackUrl,
            onWarning: warning => warnings.push(warning)
        });
        assert.equal(warnings.at(-1)?.code, "CAPACITOR_CALLBACK_URL_BLOCKED");
        assert.equal(JSON.stringify(warnings).includes(secret), false);
    } finally {
        console.warn = originalWarn;
        cleanupExternalRedirectUrlContext({ configId });
    }
});

test("callback fallback ignores an unknown state before writing or reloading", async () => {
    const configId = "native-fallback-unknown-state";
    const storage = makeStorage(configId);
    const navigator = new CapacitorNavigator({ callbackUrlPolicy: "strict" });
    const fakeCallback = `${callbackUrl}?code=fake&state=b2lkYy1zcGEu${"b".repeat(20)}`;
    let reloads = 0;
    testGlobals.window = { location: { reload: () => reloads++ } };
    launchUrl = undefined;

    try {
        await navigator.initialize({
            tokenStorageAdapter: storage,
            configId,
            callbackUrl,
            isValidForCurrentFlow: async url => url === callbackWithCode
        });

        await navigator.callback(fakeCallback);
        assert.equal(reloads, 0);
        assert.equal(storage.operations.includes("setItem"), false);

        await navigator.callback(callbackWithCode);
        assert.equal(reloads, 1);
    } finally {
        delete testGlobals.window;
        cleanupExternalRedirectUrlContext({ configId });
    }
});

test("native callback rejects duplicate state parameters", async () => {
    const configId = "native-duplicate-state";
    const storage = makeStorage(configId);
    const navigator = new CapacitorNavigator({ callbackUrlPolicy: "strict" });
    const duplicateStateUrl = `${callbackWithCode}&state=b2lkYy1zcGEu${"b".repeat(20)}`;
    let reloads = 0;
    testGlobals.window = { location: { reload: () => reloads++ } };
    launchUrl = undefined;

    try {
        await navigator.initialize({
            tokenStorageAdapter: storage,
            configId,
            callbackUrl,
            isValidForCurrentFlow: async () => true
        });

        await navigator.callback(duplicateStateUrl);
        assert.equal(reloads, 0);
        assert.equal(storage.operations.includes("setItem"), false);
    } finally {
        delete testGlobals.window;
        cleanupExternalRedirectUrlContext({ configId });
    }
});

test("failed appUrlOpen persistence does not reload or disclose the callback", async () => {
    const configId = "native-warm-write-failed";
    const storage = makeStorage(configId);
    const secretCallback = `${callbackUrl}?code=private-code&state=b2lkYy1zcGEu${"a".repeat(20)}`;
    const warnings: unknown[] = [];
    const originalWarn = console.warn;
    console.warn = (...args) => warnings.push(args);
    storage.setItem = async () => {
        throw new Error(`write failed: ${secretCallback}`);
    };
    let reloads = 0;
    testGlobals.window = { location: { reload: () => reloads++ } };
    launchUrl = undefined;
    const navigator = new CapacitorNavigator({ callbackUrlPolicy: "strict" });

    try {
        await navigator.initialize({
            tokenStorageAdapter: storage,
            configId,
            callbackUrl,
            onWarning: warning => warnings.push(warning)
        });
        await navigator.prepare({});
        await appUrlOpenListener!({ url: secretCallback });
        assert.equal(reloads, 0);
        assert.equal(JSON.stringify(warnings).includes(secretCallback), false);
    } finally {
        console.warn = originalWarn;
        delete testGlobals.window;
        appUrlOpenListener = undefined;
        cleanupExternalRedirectUrlContext({ configId });
    }
});

test("failed new callback write cannot replay an older persisted callback", async () => {
    const configId = "native-failed-write-supersession";
    const storage = makeStorage(configId);
    const redirectKey = `oidc-spa:external-redirect-url:${configId}`;
    const olderCallback = `${callbackUrl}?code=older&state=b2lkYy1zcGEu${"a".repeat(20)}`;
    storage.entries.set(redirectKey, JSON.stringify({ url: olderCallback, createdAt: Date.now() }));
    storage.setItem = async key => {
        if (key === redirectKey) throw new Error("protected write denied");
    };
    launchUrl = undefined;
    const originalWarn = console.warn;
    console.warn = () => {};

    try {
        const navigator = new CapacitorNavigator({ callbackUrlPolicy: "strict" });
        await navigator.initialize({
            tokenStorageAdapter: storage,
            configId,
            callbackUrl,
            isValidForCurrentFlow: async () => true
        });
        await navigator.prepare({});
        await appUrlOpenListener!({ url: callbackWithCode });
        cleanupExternalRedirectUrlContext({ configId });

        assert.equal(
            await peekExternalRedirectUrl({ configId, tokenStorageAdapter: storage }),
            undefined
        );
        assert.equal(storage.entries.has(redirectKey), false);
    } finally {
        console.warn = originalWarn;
        appUrlOpenListener = undefined;
        cleanupExternalRedirectUrlContext({ configId });
    }
});

test("failed replacement cannot replay an older callback cached in memory", async () => {
    const configId = "native-failed-write-memory-supersession";
    const storage = makeStorage(configId);
    const redirectKey = `oidc-spa:external-redirect-url:${configId}`;
    const olderCallback = `${callbackUrl}?code=older&state=b2lkYy1zcGEu${"a".repeat(20)}`;
    launchUrl = undefined;

    try {
        await setExternalRedirectUrl({ configId, url: olderCallback, tokenStorageAdapter: storage });
        storage.setItem = async key => {
            if (key === redirectKey) throw new Error("protected write denied");
        };

        await assert.rejects(
            setExternalRedirectUrl({ configId, url: callbackWithCode, tokenStorageAdapter: storage }),
            /protected write denied/
        );
        assert.equal(
            await peekExternalRedirectUrl({
                configId,
                tokenStorageAdapter: storage,
                isValidForCurrentFlow: async () => true
            }),
            undefined
        );
    } finally {
        cleanupExternalRedirectUrlContext({ configId });
    }
});

test("persisted callback is not replayed if the supersession marker cannot be read", async () => {
    const configId = "native-no-local-storage";
    const storage = makeStorage(configId);
    const getItem = global.localStorage.getItem;
    const redirectKey = `oidc-spa:external-redirect-url:${configId}`;
    const olderCallback = `${callbackUrl}?code=older&state=b2lkYy1zcGEu${"f".repeat(20)}`;
    storage.entries.set(redirectKey, JSON.stringify({ url: olderCallback, createdAt: Date.now() }));
    launchUrl = callbackWithCode;

    try {
        await start(configId, storage);
        await clearExternalRedirectUrl({ configId, tokenStorageAdapter: storage });
        cleanupExternalRedirectUrlContext({ configId });
        global.localStorage.getItem = () => {
            throw new Error("localStorage unavailable");
        };

        assert.equal(
            await peekExternalRedirectUrl({ configId, tokenStorageAdapter: storage }),
            undefined
        );
    } finally {
        global.localStorage.getItem = getItem;
        cleanupExternalRedirectUrlContext({ configId });
    }
});

test("native pre-browser hook waits for persistence and receives the final URL and state", async () => {
    const configId = "native-before-browser-waits";
    const storage = makeStorage(configId);
    const state = "state-to-persist";
    const authorizationUrl = `https://issuer.example/auth?state=${state}&prompt=login`;
    const gate = deferred();
    const entered = deferred();
    const observed: NativeAuthorizationRequest[] = [];
    browserOpenCalls = [];
    launchUrl = undefined;
    const navigator = new CapacitorNavigator({
        beforeBrowserOpen: async request => {
            observed.push(request);
            entered.resolve();
            await gate.promise;
        }
    });

    try {
        await navigator.initialize({ tokenStorageAdapter: storage, configId, callbackUrl });
        const browserWindow = await navigator.prepare({});
        const pendingNavigation = browserWindow.navigate({
            url: authorizationUrl,
            state,
            response_mode: "query"
        });
        await Promise.race([
            entered.promise,
            pendingNavigation.then(() => {
                throw new Error("HOOK_NOT_CALLED_BEFORE_BROWSER_OPEN");
            })
        ]);
        assert.deepEqual(browserOpenCalls, []);
        assert.deepEqual(observed, [{ configId, authorizationUrl, state }]);
        gate.resolve();
        assert.deepEqual(await pendingNavigation, { url: authorizationUrl });
        assert.deepEqual(browserOpenCalls, [authorizationUrl]);
        browserWindow.close();
    } finally {
        gate.resolve();
        cleanupExternalRedirectUrlContext({ configId });
    }
});

test("native pre-browser hook rejects missing, repeated, and mismatched authorization states", async () => {
    for (const [label, url, state] of [
        ["missing", "https://issuer.example/auth", "expected"],
        ["repeated", "https://issuer.example/auth?state=expected&state=expected", "expected"],
        ["mismatched", "https://issuer.example/auth?state=other", "expected"]
    ]) {
        const configId = `native-hook-${label}`;
        const storage = makeStorage(configId);
        const observed: NativeAuthorizationRequest[] = [];
        browserOpenCalls = [];
        launchUrl = undefined;
        const navigator = new CapacitorNavigator({
            beforeBrowserOpen: async request => {
                observed.push(request);
            }
        });
        const originalWarn = console.warn;
        console.warn = () => {};
        try {
            await navigator.initialize({ tokenStorageAdapter: storage, configId, callbackUrl });
            const browserWindow = await navigator.prepare({});
            await assert.rejects(
                browserWindow.navigate({ url, state, response_mode: "query" }),
                /invalid OIDC state/
            );
            assert.deepEqual(observed, []);
            assert.deepEqual(browserOpenCalls, []);
            browserWindow.close();
        } finally {
            console.warn = originalWarn;
            cleanupExternalRedirectUrlContext({ configId });
        }
    }
});

test("a rejected native pre-browser hook never opens Browser or leaks the URL in warnings", async () => {
    const configId = "native-hook-rejected";
    const storage = makeStorage(configId);
    const state = "secret-state";
    const authorizationUrl = `https://issuer.example/auth?state=${state}&client_secret=secret-value`;
    const warnings: string[] = [];
    const originalWarn = console.warn;
    console.warn = message => warnings.push(message);
    browserOpenCalls = [];
    browserListenerRemovals = 0;
    appListenerRemovals = 0;
    launchUrl = undefined;
    const navigator = new CapacitorNavigator({
        beforeBrowserOpen: async () => {
            throw new Error(`persist failed: ${authorizationUrl}`);
        }
    });

    try {
        await navigator.initialize({
            tokenStorageAdapter: storage,
            configId,
            callbackUrl,
            onWarning: warning => warnings.push(JSON.stringify(warning))
        });
        const browserWindow = await navigator.prepare({});
        await assert.rejects(
            browserWindow.navigate({ url: authorizationUrl, state, response_mode: "query" }),
            /Native authorization handoff failed/
        );
        assert.deepEqual(browserOpenCalls, []);
        assert.equal(browserListenerRemovals, 1);
        assert.equal(appListenerRemovals, 1);
        assert.ok(warnings.length > 0);
        assert.equal(
            warnings.some(warning => warning.includes(authorizationUrl)),
            false
        );
        assert.equal(
            warnings.some(warning => warning.includes(state)),
            false
        );
    } finally {
        console.warn = originalWarn;
        cleanupExternalRedirectUrlContext({ configId });
    }
});

test("native authorization hook does not receive a token-bearing logout URL", async () => {
    const configId = "native-hook-logout";
    const storage = makeStorage(configId);
    const logoutUrl = "https://issuer.example/logout?state=logout-state&id_token_hint=secret-id-token";
    const observed: NativeAuthorizationRequest[] = [];
    browserOpenCalls = [];
    launchUrl = undefined;
    const navigator = new CapacitorNavigator({
        beforeBrowserOpen: async request => {
            observed.push(request);
        }
    });

    try {
        await navigator.initialize({ tokenStorageAdapter: storage, configId, callbackUrl });
        const browserWindow = await navigator.prepare({});
        assert.deepEqual(await browserWindow.navigate({ url: logoutUrl, state: "logout-state" }), {
            url: logoutUrl
        });
        assert.deepEqual(observed, []);
        assert.deepEqual(browserOpenCalls, [logoutUrl]);
        browserWindow.close();
    } finally {
        cleanupExternalRedirectUrlContext({ configId });
    }
});

test("real UserManager persists sign-in before the hook and bypasses it for sign-out", async () => {
    const configId = "native-real-user-manager";
    const storage = makeStorage(configId);
    const stateEntries = new Map();
    const events: string[] = [];
    const observed: NativeAuthorizationRequest[] = [];
    const previousWindow = testGlobals.window;
    testGlobals.window = {
        crypto: webcrypto,
        location: { href: "https://app.example/" },
        setTimeout,
        clearTimeout
    };
    browserOpenCalls = [];
    launchUrl = undefined;

    const navigator = new CapacitorNavigator({
        beforeBrowserOpen: async request => {
            events.push("hook");
            observed.push(request);
        }
    });
    const stateStore = new WebStorageStateStore({
        store: {
            get length() {
                return Promise.resolve(stateEntries.size);
            },
            clear: async () => {
                stateEntries.clear();
            },
            key: async index => [...stateEntries.keys()][index] ?? null,
            getItem: async key => stateEntries.get(key) ?? null,
            setItem: async (key, value) => {
                events.push("state.setItem");
                stateEntries.set(key, value);
            },
            removeItem: async key => {
                stateEntries.delete(key);
            }
        }
    });
    const manager = new UserManager(
        {
            stateUrlParamValue: `b2lkYy1zcGEu${"a".repeat(20)}`,
            authority: "https://issuer.example",
            client_id: "client",
            redirect_uri: callbackUrl,
            post_logout_redirect_uri: callbackUrl,
            response_type: "code",
            response_mode: "query",
            scope: "openid",
            metadata: {
                issuer: "https://issuer.example",
                authorization_endpoint: "https://issuer.example/auth",
                end_session_endpoint: "https://issuer.example/logout",
                token_endpoint: "https://issuer.example/token",
                jwks_uri: "https://issuer.example/jwks"
            },
            stateStore,
            userStore: new WebStorageStateStore({ store: new InMemoryWebStorage() })
        },
        navigator
    );

    try {
        await navigator.initialize({ tokenStorageAdapter: storage, configId, callbackUrl });
        await manager.signinRedirect({
            transformUrl: url => {
                const transformed = new URL(url);
                transformed.searchParams.set("native_probe", "final");
                return transformed.toString();
            }
        });
        assert.ok(events.indexOf("state.setItem") >= 0);
        assert.ok(events.indexOf("state.setItem") < events.indexOf("hook"));
        assert.equal(observed.length, 1);
        assert.equal(observed[0].authorizationUrl, browserOpenCalls[0]);
        assert.equal(new URL(observed[0].authorizationUrl).searchParams.get("native_probe"), "final");
        assert.equal(new URL(browserOpenCalls[0]).searchParams.get("state"), observed[0].state);

        await manager.signoutRedirect({ id_token_hint: "secret-id-token" });
        assert.equal(observed.length, 1);
        assert.equal(browserOpenCalls.length, 2);
        assert.equal(new URL(browserOpenCalls[1]).searchParams.get("id_token_hint"), "secret-id-token");
    } finally {
        if (previousWindow === undefined) delete testGlobals.window;
        else testGlobals.window = previousWindow;
        cleanupExternalRedirectUrlContext({ configId });
    }
});

test("native navigation without a pre-browser hook keeps opening Browser", async () => {
    const configId = "native-without-hook";
    const storage = makeStorage(configId);
    browserOpenCalls = [];
    launchUrl = undefined;
    const navigator = new CapacitorNavigator();
    try {
        await navigator.initialize({ tokenStorageAdapter: storage, configId, callbackUrl });
        const browserWindow = await navigator.prepare({});
        const url = "https://issuer.example/auth?without-state=allowed-without-hook";
        assert.deepEqual(await browserWindow.navigate({ url }), { url });
        assert.deepEqual(browserOpenCalls, [url]);
        browserWindow.close();
    } finally {
        cleanupExternalRedirectUrlContext({ configId });
    }
});
