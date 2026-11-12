import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { test, vi } from "vitest";
import { startLoginOrRefreshProcess } from "../src/core/ongoingLoginOrRefreshProcesses";

const events: string[] = [];
let browserOpenError: Error | undefined;
let beforeBrowserOpen: (() => Promise<void>) | undefined;

vi.stubGlobal("window", {
    crypto: webcrypto,
    location: {
        href: "https://app.example/",
        origin: "https://app.example",
        pathname: "/",
        assign() {
            throw new Error("BROWSER_REDIRECT");
        },
        replace() {
            throw new Error("BROWSER_REDIRECT");
        },
        reload() {
            events.push("reload");
        }
    },
    setTimeout,
    clearTimeout,
    addEventListener() {},
    removeEventListener() {},
    history: { back() {} }
});
vi.stubGlobal("location", window.location);
(window as Window & { self: Window }).self = window;
vi.stubGlobal("history", { pushState() {}, replaceState() {}, back() {} });
vi.stubGlobal("document", {
    cookie: "",
    visibilityState: "visible",
    addEventListener() {},
    documentElement: { prepend() {} },
    createElement: () => ({ style: {}, textContent: "" })
});
vi.stubGlobal("navigator", { onLine: true });

function memoryStorage(entries = new Map<string, string>()) {
    return {
        entries,
        get length() {
            return Promise.resolve(entries.size);
        },
        clear: async () => entries.clear(),
        getItem: async (key: string) => entries.get(key) ?? null,
        key: async (index: number) => [...entries.keys()][index] ?? null,
        removeItem: async (key: string) => {
            entries.delete(key);
        },
        setItem: async (key: string, value: string) => {
            if (key.startsWith("oidc.")) events.push("state");
            entries.set(key, value);
        }
    };
}

const browserStorage = memoryStorage();
vi.stubGlobal("localStorage", browserStorage);
vi.stubGlobal("sessionStorage", browserStorage);

vi.mock("@capacitor/app", () => ({
    App: {
        getLaunchUrl: async () => undefined,
        addListener: async () => ({ remove() {} })
    }
}));
vi.mock("@capacitor/browser", () => ({
    Browser: {
        addListener: async () => ({ remove() {} }),
        close: async () => {},
        open: async () => {
            events.push("open");
            if (browserOpenError !== undefined) throw browserOpenError;
        }
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

const metadata = {
    issuer: "https://issuer.example",
    authorization_endpoint: "https://issuer.example/auth",
    token_endpoint: "https://issuer.example/token",
    end_session_endpoint: "https://issuer.example/logout",
    jwks_uri: "https://issuer.example/jwks",
    response_types_supported: ["code"],
    subject_types_supported: ["public"],
    id_token_signing_alg_values_supported: ["RS256"]
};

function jwt(claims: Record<string, unknown>) {
    return `e30.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.sig`;
}

let runNumber = 0;

async function createRestoredNativeSession(
    params: {
        prepareNativeAutomaticLoginRedirect?: () => Promise<() => Promise<void>>;
        onNavigatorWarning?: (warning: { code: string }) => void;
    },
    nativeSessionRestoreMode: "prefer-local-restore" | "full-page-redirect" = "prefer-local-restore",
    includePersistedUser = true,
    authBrowser?: NonNullable<ConstructorParameters<typeof CapacitorNavigator>[0]>["authBrowser"]
) {
    const configId = `https://issuer.example:client-${++runNumber}`;
    const stateStorage = memoryStorage(
        new Map([
            [
                `oidc-spa:auth-state:${configId}`,
                JSON.stringify({
                    __brand: "PersistedAuthState-v1",
                    stateDescription: "logged in",
                    untilTime: Date.now() + 3600_000
                })
            ]
        ])
    );
    const tokenStorage = memoryStorage(
        new Map(
            includePersistedUser
                ? [
                      [
                          `oidc-spa:lazy-session-storage:${configId}:oidc.user:https://issuer.example:client-${runNumber}`,
                          JSON.stringify({
                              access_token: jwt({ exp: Math.floor(Date.now() / 1000) + 3600 }),
                              id_token: jwt({
                                  sub: "subject",
                                  exp: Math.floor(Date.now() / 1000) + 3600
                              }),
                              refresh_token: "expired-refresh-token",
                              token_type: "Bearer",
                              scope: "openid",
                              profile: { sub: "subject" },
                              expires_at: Math.floor(Date.now() / 1000) + 3600,
                              __oidc_spa_tokenResponse: { expires_in: 3600 },
                              __oidc_spa_localTimeWhenTokenIssued: Date.now()
                          })
                      ]
                  ]
                : []
        )
    );
    const navigator = new CapacitorNavigator({
        callbackUrlPolicy: "strict",
        authBrowser,
        beforeBrowserOpen: async () => {
            events.push("bind");
            await beforeBrowserOpen?.();
        }
    });
    const oidc = await createOidc_nonMemoized(
        {
            BASE_URL: "https://app.example/",
            autoLogin: false,
            isNativeApp: true,
            nativeSessionRestoreMode,
            navigator,
            storageAdapter: stateStorage,
            tokenStorageAdapter: tokenStorage,
            postLoginRedirectUrl: "myapp://auth-callback",
            __metadata: metadata,
            ...params
        },
        {
            issuerUri: "https://issuer.example",
            clientId: `client-${runNumber}`,
            configId,
            log: undefined
        }
    );
    assert.equal(oidc.isUserLoggedIn, true);
    return { oidc, configId, stateStorage };
}

async function assertAuthCanContinue() {
    let acquired = false;
    const acquiring = startLoginOrRefreshProcess().then(({ completeLoginOrRefreshProcess }) => {
        acquired = true;
        completeLoginOrRefreshProcess();
    });
    await vi.waitFor(() => assert.equal(acquired, true));
    await acquiring;
}

test("native logout cancellation and failure release the shared auth lock for retries", async () => {
    const native = {
        open: vi.fn(async () => ({ cancelled: true as const })),
        close: vi.fn(() => Promise.resolve())
    };
    const { oidc, configId } = await createRestoredNativeSession(
        {},
        "prefer-local-restore",
        true,
        native
    );
    const unexpectedErrors: unknown[] = [];
    try {
        assert.ok(oidc.isUserLoggedIn);
        void oidc.logout({ redirectTo: "home" }).catch(error => unexpectedErrors.push(error));
        await vi.waitFor(() => assert.equal(native.open.mock.calls.length, 1));
        await assertAuthCanContinue();
        assert.deepEqual(unexpectedErrors, []);

        const nativeError = new Error("native logout failed");
        native.open.mockRejectedValueOnce(nativeError);
        await assert.rejects(oidc.logout({ redirectTo: "home" }), error => error === nativeError);
        await assertAuthCanContinue();
        assert.equal(native.open.mock.calls.length, 2);
    } finally {
        cleanupExternalRedirectUrlContext({ configId });
    }
});
