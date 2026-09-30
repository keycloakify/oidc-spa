import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { test, vi } from "vitest";

const localEntries = new Map<string, string>();
const sessionEntries = new Map<string, string>();
let launchUrl: string | undefined;
let events: string[];
let stopAfterStartupDecision = true;

vi.stubGlobal("window", {
    crypto: webcrypto,
    location: {
        href: "https://app.example/",
        origin: "https://app.example",
        pathname: "/",
        reload() {}
    },
    setTimeout,
    clearTimeout
});
vi.stubGlobal("localStorage", {
    get length() {
        return localEntries.size;
    },
    clear: () => localEntries.clear(),
    getItem: key => localEntries.get(key) ?? null,
    key: index => [...localEntries.keys()][index] ?? null,
    removeItem: key => localEntries.delete(key),
    setItem: (key, value) => localEntries.set(key, value)
});
vi.stubGlobal("sessionStorage", {
    get length() {
        return sessionEntries.size;
    },
    clear: () => sessionEntries.clear(),
    getItem: key => sessionEntries.get(key) ?? null,
    key: index => [...sessionEntries.keys()][index] ?? null,
    removeItem: key => sessionEntries.delete(key),
    setItem: (key, value) => sessionEntries.set(key, value)
});
vi.stubGlobal("history", {
    replaceState: () => {
        events.push("history.replaceState");
        if (stopAfterStartupDecision) throw new Error("STOP_AFTER_STARTUP_DECISION");
    }
});

vi.mock("@capacitor/app", () => ({
    App: {
        getLaunchUrl: async () => {
            events.push("getLaunchUrl");
            return launchUrl === undefined ? undefined : { url: launchUrl };
        },
        addListener: async () => ({ remove() {} })
    }
}));
vi.mock("@capacitor/browser", () => ({
    Browser: {
        addListener: async () => ({ remove() {} }),
        close: async () => {},
        open: async () => {}
    }
}));
vi.mock("@capacitor/core", () => ({
    Capacitor: { getPlatform: async () => "android" }
}));

const { createEvt } = await import("../src/tools/Evt");
const { CapacitorNavigator } = await import("../src/capacitor/CapacitorNavigator");
const { createOidc_nonMemoized, registerExports_earlyInit } = await import("../src/core/createOidc");
const { cleanupExternalRedirectUrlContext } = await import("../src/core/externalRedirectUrl");

registerExports_earlyInit({
    shouldLoadApp: true,
    getEvtIframeAuthResponse: () => createEvt(),
    getRedirectAuthResponse: () => ({ authResponse: undefined }),
    sessionRestorationMethod: "full page redirect"
});

const callbackBase = "myapp://auth-callback";
const state = `b2lkYy1zcGEu${"a".repeat(20)}`;
const metadata = {
    issuer: "https://issuer.example",
    authorization_endpoint: "https://issuer.example/auth",
    token_endpoint: "https://issuer.example/token",
    jwks_uri: "https://issuer.example/jwks",
    response_types_supported: ["code"],
    subject_types_supported: ["public"],
    id_token_signing_alg_values_supported: ["RS256"]
};

let scenarioNumber = 0;

async function runStartup({
    callback,
    outbound = false,
    validState = false,
    stateCreatedAt = Math.floor(Date.now() / 1000),
    captureDebugLogs = false,
    explicitlyLoggedOut = false,
    persistedAuthStateJson,
    allowTokenScan = false,
    stopAfterRestoredUser = false,
    stateAction = "login",
    persistAcceptedLaunchCallbackToTokenStorage = false,
    failCallbackWrite = false
}: {
    callback?: string;
    outbound?: boolean;
    validState?: boolean;
    stateCreatedAt?: number;
    captureDebugLogs?: boolean;
    explicitlyLoggedOut?: boolean;
    persistedAuthStateJson?: string;
    allowTokenScan?: boolean;
    stopAfterRestoredUser?: boolean;
    stateAction?: "login" | "logout";
    persistAcceptedLaunchCallbackToTokenStorage?: boolean;
    failCallbackWrite?: boolean;
} = {}) {
    const configId = `https://issuer.example:client-${++scenarioNumber}`;
    const stateEntries = new Map();
    const tokenEntries = new Map([
        [
            `oidc-spa:lazy-session-storage:${configId}:oidc.user:https://issuer.example:client`,
            JSON.stringify({
                access_token: "previous-access-token",
                refresh_token: "previous-refresh-token",
                expires_at: Math.floor(Date.now() / 1000) + 3600,
                __oidc_spa_tokenResponse: {},
                __oidc_spa_localTimeWhenTokenIssued: Date.now()
            })
        ]
    ]);
    let userRemovalAttempts = 0;
    if (outbound) tokenEntries.set("outbound-proof", "non-authorizing-proof");
    if (explicitlyLoggedOut) {
        stateEntries.set(
            `oidc-spa:auth-state:${configId}`,
            JSON.stringify({
                __brand: "PersistedAuthState-v1",
                stateDescription: "explicitly logged out"
            })
        );
    }
    if (persistedAuthStateJson !== undefined) {
        stateEntries.set(`oidc-spa:auth-state:${configId}`, persistedAuthStateJson);
    }
    if (validState) {
        stateEntries.set(
            `oidc.${state}`,
            JSON.stringify({
                created: stateCreatedAt,
                data: {
                    context: "redirect",
                    action: stateAction,
                    configId,
                    sessionId: "test-session",
                    rootRelativeRedirectUrl: "/",
                    rootRelativeRedirectUrl_consentRequiredCase: "/",
                    extraQueryParams: {}
                }
            })
        );
    }

    events = [];
    stopAfterStartupDecision = !captureDebugLogs;
    const debugMessages: string[] = [];
    launchUrl = callback;
    let abortCalls = 0;
    const navigator = new (class extends CapacitorNavigator {
        initialize(params) {
            return super.initialize({
                ...params,
                onAuthFlowAborted: () => {
                    abortCalls++;
                    params.onAuthFlowAborted?.();
                }
            });
        }
    })({ callbackUrlPolicy: "strict", persistAcceptedLaunchCallbackToTokenStorage });
    const stateStorage = {
        get length() {
            return Promise.resolve(stateEntries.size);
        },
        clear: async () => stateEntries.clear(),
        getItem: async key => {
            events.push("stateStore.getItem");
            return stateEntries.get(key) ?? null;
        },
        key: async index => [...stateEntries.keys()][index] ?? null,
        removeItem: async key => {
            stateEntries.delete(key);
        },
        setItem: async (key, value) => {
            stateEntries.set(key, value);
        }
    };
    const tokenStorageAdapter = {
        get length(): Promise<number> {
            events.push("length");
            if (!allowTokenScan) throw new Error("STOP_AT_FIRST_SCAN");
            return Promise.resolve(tokenEntries.size);
        },
        clear: async () => tokenEntries.clear(),
        getItem: async key => {
            events.push("token.getItem");
            return tokenEntries.get(key) ?? null;
        },
        key: async index => {
            events.push("token.key");
            return [...tokenEntries.keys()][index] ?? null;
        },
        removeItem: async key => {
            events.push("token.removeItem");
            if (explicitlyLoggedOut && key.includes("oidc.user:") && ++userRemovalAttempts > 1) {
                throw new Error("protected token deletion failed after initial load");
            }
            tokenEntries.delete(key);
        },
        setItem: async (key, value) => {
            events.push("token.setItem");
            if (key === `oidc-spa:external-redirect-url:${configId}`) {
                events.push("redirect.setItem");
                if (failCallbackWrite) throw new Error("protected store write failed");
            }
            tokenEntries.set(key, value);
        }
    };

    let outcome;
    try {
        outcome = await createOidc_nonMemoized(
            {
                BASE_URL: "https://app.example/",
                isNativeApp: true,
                nativeSessionRestoreMode: "prefer-local-restore",
                navigator,
                tokenStorageAdapter,
                storageAdapter: stateStorage,
                postLoginRedirectUrl: callbackBase,
                __metadata: metadata
            },
            {
                issuerUri: "https://issuer.example",
                clientId: "client",
                configId,
                log: captureDebugLogs
                    ? (...args) => {
                          const message = args.join(" ");
                          debugMessages.push(message);
                          if (
                              stopAfterRestoredUser &&
                              message === "Session was restored from session storage"
                          ) {
                              throw new Error("STOP_AFTER_RESTORE_DECISION");
                          }
                      }
                    : undefined
            }
        );
    } catch (error) {
        outcome = error;
    } finally {
        cleanupExternalRedirectUrlContext({ configId });
    }

    return { events, abortCalls, outcome, debugMessages, stateEntries, tokenEntries };
}

test("failed native login callback invalidates the previous persisted token record", async () => {
    const previousDocument = globalThis.document;
    const previousNavigator = globalThis.navigator;
    const previousAddEventListener = window.addEventListener;
    vi.stubGlobal("document", { cookie: "" });
    vi.stubGlobal("navigator", { onLine: false });
    window.addEventListener = () => {};

    try {
        const { outcome, stateEntries, tokenEntries } = await runStartup({
            callback: `${callbackBase}?error=access_denied&state=${state}`,
            validState: true,
            captureDebugLogs: true
        });

        assert.equal(outcome?.isUserLoggedIn, false);
        assert.ok([...tokenEntries.keys()].some(key => key.includes("oidc.user:")));
        const authState = [...stateEntries.entries()].find(([key]) =>
            key.startsWith("oidc-spa:auth-state:")
        );
        assert.equal(JSON.parse(authState?.[1] ?? "null")?.stateDescription, "explicitly logged out");
    } finally {
        vi.stubGlobal("document", previousDocument);
        vi.stubGlobal("navigator", previousNavigator);
        window.addEventListener = previousAddEventListener;
    }
});

test("explicit logout marker blocks restoration of a token record left by failed deletion", async () => {
    const { outcome, events, tokenEntries } = await runStartup({
        explicitlyLoggedOut: true,
        allowTokenScan: true,
        captureDebugLogs: true
    });

    assert.equal(outcome?.isUserLoggedIn, false);
    assert.ok(events.includes("token.getItem"));
    assert.ok([...tokenEntries.keys()].some(key => key.includes("oidc.user:")));
});

test.each([
    ["missing", undefined],
    [
        "expired",
        JSON.stringify({
            __brand: "PersistedAuthState-v1",
            stateDescription: "logged in",
            untilTime: Date.now() - 1_000
        })
    ],
    ["malformed", "{"]
])(
    "native startup does not restore old tokens with an %s auth-state marker",
    async (_label, persistedAuthStateJson) => {
        const { debugMessages } = await runStartup({
            persistedAuthStateJson,
            allowTokenScan: true,
            captureDebugLogs: true
        });

        assert.equal(debugMessages.includes("Session was restored from session storage"), false);
    }
);

test("native startup can restore a persisted user with a current logged-in marker", async () => {
    const { debugMessages, outcome } = await runStartup({
        persistedAuthStateJson: JSON.stringify({
            __brand: "PersistedAuthState-v1",
            stateDescription: "logged in",
            untilTime: Date.now() + 60_000
        }),
        allowTokenScan: true,
        captureDebugLogs: true,
        stopAfterRestoredUser: true
    });

    assert.equal(debugMessages.includes("Session was restored from session storage"), true);
    assert.equal(outcome?.message, "STOP_AFTER_RESTORE_DECISION");
});

test("App-Icon start with outbound proof reaches protected scan after launch policy", async () => {
    const { events, abortCalls, outcome } = await runStartup({ outbound: true });
    assert.match(outcome.message, /STOP_AT_FIRST_SCAN/);
    assert.deepEqual(events.slice(0, 2), ["getLaunchUrl", "length"]);
    assert.equal(abortCalls, 0);
});

test("ordinary native start reaches protected scan after launch lookup", async () => {
    const { events, outcome } = await runStartup();
    assert.match(outcome.message, /STOP_AT_FIRST_SCAN/);
    assert.deepEqual(events.slice(0, 2), ["getLaunchUrl", "length"]);
});

test("policy-rejected launch callback reaches protected scan", async () => {
    const warnings: unknown[] = [];
    const originalWarn = console.warn;
    console.warn = message => warnings.push(message);
    let result;
    try {
        result = await runStartup({
            callback: `otherapp://auth-callback?code=code&state=${state}`
        });
    } finally {
        console.warn = originalWarn;
    }
    const { events, outcome } = result;
    assert.match(outcome.message, /STOP_AT_FIRST_SCAN/);
    assert.deepEqual(events.slice(0, 2), ["getLaunchUrl", "length"]);
    assert.equal(warnings.length, 1);
});

test("policy-accepted callback with unknown OIDC state reaches protected scan", async () => {
    const { events, outcome } = await runStartup({
        callback: `${callbackBase}?code=code&state=${state}`
    });
    assert.match(outcome.message, /STOP_AT_FIRST_SCAN/);
    assert.equal(events[0], "getLaunchUrl");
    assert.ok(events.includes("stateStore.getItem"));
    assert.ok(events.indexOf("stateStore.getItem") < events.indexOf("length"));
});

test("unknown cold callback cannot write to protected token storage", async () => {
    const { events, outcome } = await runStartup({
        callback: `${callbackBase}?code=code&state=${state}`,
        persistAcceptedLaunchCallbackToTokenStorage: true
    });

    assert.match(outcome.message, /STOP_AT_FIRST_SCAN/);
    assert.ok(events.includes("stateStore.getItem"));
    assert.equal(events.includes("token.setItem"), false);
});

test("state-bound cold callback skips the initial protected scan", { timeout: 3000 }, async () => {
    const { events, abortCalls, outcome } = await runStartup({
        callback: `${callbackBase}?code=code&state=${state}`,
        outbound: true,
        validState: true
    });
    assert.equal(events[0], "getLaunchUrl");
    assert.ok(events.includes("stateStore.getItem"));
    assert.equal(events.includes("length"), false);
    assert.equal(abortCalls, 0);
    assert.equal(outcome?.message, "STOP_AFTER_STARTUP_DECISION");
    assert.equal(events.at(-1), "history.replaceState");
});

test("a callback for OIDC state older than 15 minutes cannot bypass the protected scan", async () => {
    const { events, outcome } = await runStartup({
        callback: `${callbackBase}?code=code&state=${state}`,
        validState: true,
        stateCreatedAt: Math.floor(Date.now() / 1000) - 901
    });

    assert.match(outcome.message, /STOP_AT_FIRST_SCAN/);
    assert.ok(events.includes("stateStore.getItem"));
    assert.ok(events.includes("length"));
    assert.equal(events.includes("token.setItem"), false);
});

test("logout callback persists an explicit logout marker before returning", async () => {
    const { events, stateEntries } = await runStartup({
        callback: `${callbackBase}?state=${state}`,
        validState: true,
        stateAction: "logout",
        captureDebugLogs: true
    });

    assert.ok(events.includes("history.replaceState"));
    const authState = [...stateEntries.entries()].find(([key]) =>
        key.startsWith("oidc-spa:auth-state:")
    );
    assert.equal(JSON.parse(authState?.[1] ?? "null")?.stateDescription, "explicitly logged out");
});

test(
    "opted-in state-bound callback is persisted before the user-store decision",
    { timeout: 3000 },
    async () => {
        const { events, outcome } = await runStartup({
            callback: `${callbackBase}?code=code&state=${state}`,
            outbound: true,
            validState: true,
            persistAcceptedLaunchCallbackToTokenStorage: true
        });
        assert.equal(events[0], "getLaunchUrl");
        assert.ok(events.indexOf("stateStore.getItem") < events.indexOf("token.setItem"));
        assert.ok(events.indexOf("token.setItem") < events.indexOf("redirect.setItem"));
        assert.equal(events.includes("length"), false);
        assert.equal(outcome?.message, "STOP_AFTER_STARTUP_DECISION");
        assert.equal(events.at(-1), "history.replaceState");
    }
);

test("failed opted-in callback persistence falls back to the protected user-store scan", async () => {
    const originalWarn = console.warn;
    console.warn = () => {};
    try {
        const { events, outcome } = await runStartup({
            callback: `${callbackBase}?code=code&state=${state}`,
            outbound: true,
            validState: true,
            persistAcceptedLaunchCallbackToTokenStorage: true,
            failCallbackWrite: true
        });
        assert.match(outcome.message, /STOP_AT_FIRST_SCAN/);
        assert.equal(events[0], "getLaunchUrl");
        assert.ok(events.indexOf("stateStore.getItem") < events.indexOf("token.setItem"));
        assert.ok(events.indexOf("token.setItem") < events.indexOf("redirect.setItem"));
        assert.ok(events.indexOf("redirect.setItem") < events.indexOf("length"));
    } finally {
        console.warn = originalWarn;
    }
});
