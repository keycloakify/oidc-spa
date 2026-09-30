import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { test, vi } from "vitest";
import { ErrorResponse, UserManager } from "../src/vendor/frontend/oidc-client-ts";

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
    jwks_uri: "https://issuer.example/jwks",
    response_types_supported: ["code"],
    subject_types_supported: ["public"],
    id_token_signing_alg_values_supported: ["RS256"]
};

function jwt(claims: Record<string, unknown>) {
    return `e30.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.sig`;
}

let runNumber = 0;

function respondToRefreshWith400() {
    return vi
        .spyOn(UserManager.prototype, "signinSilent")
        .mockRejectedValue(new ErrorResponse({ error: "invalid_grant", error_description: "HTTP 400" }));
}

async function createRestoredNativeSession(
    params: {
        prepareNativeAutomaticLoginRedirect?: () => Promise<() => Promise<void>>;
        onNavigatorWarning?: (warning: { code: string }) => void;
    },
    nativeSessionRestoreMode: "prefer-local-restore" | "full-page-redirect" = "prefer-local-restore",
    includePersistedUser = true
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

test("restored native session registers its outbound flow before a 400 refresh fallback opens the browser", async () => {
    events.length = 0;
    browserOpenError = new Error("stop after open");
    let active = false;
    beforeBrowserOpen = async () => {
        if (!active) throw new Error("No active outbound authentication flow.");
    };
    const signinSilent = respondToRefreshWith400();
    let releaseRegistration!: () => void;
    const registrationGate = new Promise<void>(resolve => {
        releaseRegistration = resolve;
    });

    let configId: string | undefined;
    try {
        const session = await createRestoredNativeSession({
            prepareNativeAutomaticLoginRedirect: async () => {
                events.push("register");
                await registrationGate;
                active = true;
                return async () => {
                    events.push("cleanup");
                    active = false;
                };
            }
        });
        configId = session.configId;
        const rejection = assert.rejects(session.oidc.renewTokens(), /stop after open/);
        await vi.waitFor(() => assert.equal(events.includes("register"), true));
        assert.equal(events.includes("state"), false);
        assert.equal(events.includes("bind"), false);
        assert.equal(events.includes("open"), false);
        releaseRegistration();
        await rejection;
        assert.deepEqual(
            events.filter(event => ["register", "state", "bind", "open", "cleanup"].includes(event)),
            ["register", "state", "bind", "open", "cleanup"]
        );
        assert.equal(active, false);
    } finally {
        releaseRegistration();
        signinSilent.mockRestore();
        if (configId !== undefined) cleanupExternalRedirectUrlContext({ configId });
    }
});

test("failed authorization binding cleans up the registered flow before rejecting", async () => {
    events.length = 0;
    browserOpenError = undefined;
    let active = false;
    beforeBrowserOpen = async () => {
        throw new Error("binding persistence failed");
    };
    const signinSilent = respondToRefreshWith400();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    let configId: string | undefined;
    try {
        const session = await createRestoredNativeSession({
            prepareNativeAutomaticLoginRedirect: async () => {
                events.push("register");
                active = true;
                return async () => {
                    events.push("cleanup");
                    active = false;
                };
            }
        });
        configId = session.configId;
        await assert.rejects(session.oidc.renewTokens(), /Native authorization handoff failed/);
        assert.deepEqual(
            events.filter(event => ["register", "state", "bind", "open", "cleanup"].includes(event)),
            ["register", "state", "bind", "cleanup"]
        );
        assert.equal(active, false);
    } finally {
        signinSilent.mockRestore();
        warn.mockRestore();
        if (configId !== undefined) cleanupExternalRedirectUrlContext({ configId });
    }
});

test("rejected native flow registration prevents state creation and Browser.open", async () => {
    events.length = 0;
    browserOpenError = undefined;
    beforeBrowserOpen = async () => {
        throw new Error("must not bind");
    };
    const signinSilent = respondToRefreshWith400();
    let configId: string | undefined;
    try {
        const session = await createRestoredNativeSession({
            prepareNativeAutomaticLoginRedirect: async () => {
                events.push("register");
                throw new Error("outbound flow persistence failed");
            }
        });
        configId = session.configId;
        await assert.rejects(session.oidc.renewTokens(), /outbound flow persistence failed/);
        assert.deepEqual(
            events.filter(event => ["register", "state", "bind", "open"].includes(event)),
            ["register"]
        );
    } finally {
        signinSilent.mockRestore();
        if (configId !== undefined) cleanupExternalRedirectUrlContext({ configId });
    }
});

test("an already active outbound flow rejects the automatic redirect without opening Browser", async () => {
    events.length = 0;
    browserOpenError = undefined;
    let active = true;
    beforeBrowserOpen = async () => {
        if (!active) throw new Error("No active outbound authentication flow.");
    };
    const signinSilent = respondToRefreshWith400();
    let configId: string | undefined;
    try {
        const session = await createRestoredNativeSession({
            prepareNativeAutomaticLoginRedirect: async () => {
                events.push("register");
                if (active) throw new Error("Outbound flow already active");
                active = true;
                return async () => {
                    events.push("cleanup");
                    active = false;
                };
            }
        });
        configId = session.configId;
        await assert.rejects(session.oidc.renewTokens(), /Outbound flow already active/);
        assert.equal(events.includes("open"), false);
        assert.equal(events.includes("bind"), false);

        // A failed attempt must not leave the internal redirect lock in place.
        active = false;
        browserOpenError = new Error("open failed");
        await assert.rejects(session.oidc.renewTokens(), /open failed/);
        assert.deepEqual(
            events.filter(event => ["register", "bind", "open", "cleanup"].includes(event)),
            ["register", "register", "bind", "open", "cleanup"]
        );
        assert.equal(active, false);
    } finally {
        signinSilent.mockRestore();
        if (configId !== undefined) cleanupExternalRedirectUrlContext({ configId });
    }
});

test("without registration configuration, the existing beforeBrowserOpen guard still fails closed", async () => {
    events.length = 0;
    browserOpenError = undefined;
    beforeBrowserOpen = async () => {
        throw new Error("No active outbound authentication flow.");
    };
    const signinSilent = respondToRefreshWith400();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    let configId: string | undefined;
    try {
        const session = await createRestoredNativeSession({});
        configId = session.configId;
        await assert.rejects(session.oidc.renewTokens(), /Native authorization handoff failed/);
        assert.equal(events.includes("bind"), true);
        assert.equal(events.includes("open"), false);
    } finally {
        signinSilent.mockRestore();
        warn.mockRestore();
        if (configId !== undefined) cleanupExternalRedirectUrlContext({ configId });
    }
});

test("a successful refresh does not register a native outbound flow or open Browser", async () => {
    events.length = 0;
    browserOpenError = undefined;
    beforeBrowserOpen = async () => {
        throw new Error("must not bind");
    };
    let hookCalls = 0;
    const signinSilent = vi
        .spyOn(UserManager.prototype, "signinSilent")
        .mockImplementation(async function (this: UserManager) {
            const user = await this.getUser();
            assert.ok(user);
            return user;
        });
    let configId: string | undefined;
    try {
        const session = await createRestoredNativeSession({
            prepareNativeAutomaticLoginRedirect: async () => {
                hookCalls++;
                return async () => {};
            }
        });
        configId = session.configId;
        await session.oidc.renewTokens();
        assert.equal(hookCalls, 0);
        assert.equal(events.includes("bind"), false);
        assert.equal(events.includes("open"), false);
        assert.equal(events.includes("reload"), false);
    } finally {
        signinSilent.mockRestore();
        if (configId !== undefined) cleanupExternalRedirectUrlContext({ configId });
    }
});

test("explicit goToAuthServer does not use the automatic registration hook", async () => {
    events.length = 0;
    browserOpenError = new Error("explicit open failed");
    beforeBrowserOpen = async () => {};
    let hookCalls = 0;
    let configId: string | undefined;
    try {
        const session = await createRestoredNativeSession({
            prepareNativeAutomaticLoginRedirect: async () => {
                hookCalls++;
                return async () => {};
            }
        });
        configId = session.configId;
        await assert.rejects(session.oidc.goToAuthServer({}), /explicit open failed/);
        assert.equal(hookCalls, 0);
        assert.equal(events.includes("bind"), true);
        assert.equal(events.includes("open"), true);
    } finally {
        if (configId !== undefined) cleanupExternalRedirectUrlContext({ configId });
    }
});

test("native startup session restoration uses the same registration and cleanup sequence", async () => {
    events.length = 0;
    browserOpenError = new Error("startup open failed");
    let active = false;
    beforeBrowserOpen = async () => {
        if (!active) throw new Error("No active outbound authentication flow.");
    };
    const configId = `https://issuer.example:client-${runNumber + 1}`;
    try {
        await assert.rejects(
            createRestoredNativeSession(
                {
                    prepareNativeAutomaticLoginRedirect: async () => {
                        events.push("register");
                        active = true;
                        return async () => {
                            events.push("cleanup");
                            active = false;
                        };
                    }
                },
                "full-page-redirect",
                false
            ),
            /startup open failed/
        );
        assert.deepEqual(
            events.filter(event => ["register", "state", "bind", "open", "cleanup"].includes(event)),
            ["register", "state", "bind", "open", "cleanup"]
        );
        assert.equal(active, false);
    } finally {
        cleanupExternalRedirectUrlContext({ configId });
    }
});

test("automatic native clock-shift renewal reports a rejected registration without unhandled rejection", async () => {
    events.length = 0;
    browserOpenError = undefined;
    let driftCheck: (() => void) | undefined;
    const realSetTimeout = globalThis.setTimeout;
    const timerSpy = vi.spyOn(globalThis, "setTimeout").mockImplementation(((
        callback,
        delay,
        ...args
    ) => {
        if (delay === 5_000) {
            driftCheck = callback as () => void;
            return 0 as unknown as ReturnType<typeof setTimeout>;
        }
        return realSetTimeout(callback, delay, ...args);
    }) as typeof setTimeout);
    const warnings: string[] = [];
    const signinSilent = respondToRefreshWith400();
    let configId: string | undefined;
    try {
        const session = await createRestoredNativeSession({
            prepareNativeAutomaticLoginRedirect: async () => {
                events.push("register");
                throw new Error("registration failed");
            },
            onNavigatorWarning: warning => warnings.push(warning.code)
        });
        configId = session.configId;
        assert.ok(driftCheck);
        const realDateNow = Date.now;
        const dateSpy = vi.spyOn(Date, "now").mockImplementation(() => realDateNow() + 2_000);
        try {
            driftCheck();
            await vi.waitFor(() =>
                assert.deepEqual(warnings, ["NATIVE_AUTOMATIC_TOKEN_RENEWAL_FAILED"])
            );
        } finally {
            dateSpy.mockRestore();
        }
        assert.equal(events.includes("open"), false);
    } finally {
        timerSpy.mockRestore();
        signinSilent.mockRestore();
        if (configId !== undefined) cleanupExternalRedirectUrlContext({ configId });
    }
});

test("browser redirect does not invoke the optional native registration hook", async () => {
    events.length = 0;
    const configId = `https://issuer.example:web-client-${++runNumber}`;
    const entries = new Map<string, string>();
    const synchronousStorage = {
        get length() {
            return entries.size;
        },
        clear: () => entries.clear(),
        getItem: (key: string) => entries.get(key) ?? null,
        key: (index: number) => [...entries.keys()][index] ?? null,
        removeItem: (key: string) => {
            entries.delete(key);
        },
        setItem: (key: string, value: string) => {
            entries.set(key, value);
        }
    };
    vi.stubGlobal("localStorage", synchronousStorage);
    vi.stubGlobal("sessionStorage", synchronousStorage);
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
    let hookCalls = 0;
    try {
        await assert.rejects(
            createOidc_nonMemoized(
                {
                    BASE_URL: "https://app.example/",
                    autoLogin: false,
                    isNativeApp: false,
                    storageAdapter: stateStorage,
                    __metadata: metadata,
                    navigator: {
                        prepare: async () => ({
                            navigate: async () => {
                                events.push("web.navigate");
                                throw new Error("WEB_REDIRECT");
                            },
                            close() {}
                        }),
                        callback: async () => {}
                    },
                    prepareNativeAutomaticLoginRedirect: async () => {
                        hookCalls++;
                        throw new Error("native hook must not run in browser");
                    }
                },
                {
                    issuerUri: "https://issuer.example",
                    clientId: `web-client-${runNumber}`,
                    configId,
                    log: undefined
                }
            ),
            /WEB_REDIRECT/
        );
        assert.equal(hookCalls, 0);
        assert.equal(events.includes("web.navigate"), true);
        assert.equal(events.includes("open"), false);
    } finally {
        vi.stubGlobal("localStorage", browserStorage);
        vi.stubGlobal("sessionStorage", browserStorage);
        cleanupExternalRedirectUrlContext({ configId });
    }
});

test("a successful native automatic redirect leaves its registered flow for the callback", async () => {
    events.length = 0;
    browserOpenError = undefined;
    let active = false;
    beforeBrowserOpen = async () => {
        if (!active) throw new Error("No active outbound authentication flow.");
    };
    const signinSilent = respondToRefreshWith400();
    let configId: string | undefined;
    try {
        const session = await createRestoredNativeSession({
            prepareNativeAutomaticLoginRedirect: async () => {
                events.push("register");
                active = true;
                return async () => {
                    events.push("cleanup");
                    active = false;
                };
            }
        });
        configId = session.configId;
        let settled = false;
        void session.oidc.renewTokens().then(
            () => {
                settled = true;
            },
            () => {
                settled = true;
            }
        );
        await vi.waitFor(() => assert.equal(events.includes("open"), true));
        assert.deepEqual(
            events.filter(event => ["register", "state", "bind", "open", "cleanup"].includes(event)),
            ["register", "state", "bind", "open"]
        );
        assert.equal(active, true);
        assert.equal(settled, false);
        assert.equal(events.includes("reload"), false);
    } finally {
        signinSilent.mockRestore();
        if (configId !== undefined) cleanupExternalRedirectUrlContext({ configId });
    }
});
