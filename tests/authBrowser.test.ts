import { Browser } from "@capacitor/browser";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CapacitorNavigator } from "../src/capacitor/CapacitorNavigator";
import type { AuthBrowser } from "../src/capacitor";
import { cleanupExternalRedirectUrlContext } from "../src/core/externalRedirectUrl";

const bridge = vi.hoisted(() => ({
    open: vi.fn(),
    close: vi.fn(),
    removeApp: vi.fn(),
    removeBrowser: vi.fn(),
    finished: undefined as (() => void) | undefined,
    callback: undefined as ((event: { url: string }) => Promise<void>) | undefined
}));
vi.mock("@capacitor/app", () => ({
    App: {
        getLaunchUrl: async () => undefined,
        addListener: async (_name: string, callback: typeof bridge.callback) => {
            bridge.callback = callback;
            return { remove: bridge.removeApp };
        }
    }
}));
vi.mock("@capacitor/browser", () => ({
    Browser: {
        open: bridge.open,
        close: bridge.close,
        addListener: vi.fn(async (_name: string, listener: () => void) => {
            bridge.finished = listener;
            return { remove: bridge.removeBrowser };
        })
    }
}));
vi.mock("@capacitor/core", () => ({ Capacitor: { getPlatform: () => "ios" } }));

type BrowserResult = { callbackUrl: string } | { cancelled: true } | void;
const callbackUrl = "https://app.example/auth/callback";
const state = "b2lkYy1zcGEuabcdefghijklmnopqrst";
const callback = callbackUrl + "?state=" + state;
const logout = { url: "https://issuer.example/logout" };
let nextId = 0;
const configIds: string[] = [];
const reload = vi.fn();

async function start(authBrowser?: AuthBrowser, beforeBrowserOpen?: () => Promise<void>) {
    const entries = new Map<string, string>();
    const storage = {
        get length() {
            return Promise.resolve(entries.size);
        },
        clear: async () => entries.clear(),
        key: async (index: number) => [...entries.keys()][index] ?? null,
        getItem: async (key: string) => entries.get(key) ?? null,
        setItem: async (key: string, value: string) => {
            entries.set(key, value);
        },
        removeItem: async (key: string) => {
            entries.delete(key);
        }
    };
    const navigator = new CapacitorNavigator({
        callbackUrlPolicy: "strict",
        authBrowser,
        beforeBrowserOpen
    });
    const configId = "native-browser-" + ++nextId;
    configIds.push(configId);
    const onAborted = vi.fn();
    const onWarning = vi.fn();
    await navigator.initialize({
        configId,
        callbackUrl,
        storageAdapter: storage,
        tokenStorageAdapter: storage,
        isValidForCurrentFlow: async url => new URL(url).searchParams.get("state") === state,
        onAuthFlowAborted: onAborted,
        onWarning
    });
    const listener = vi.fn();
    navigator.addAuthFlowAbortedListener(listener);
    return { navigator, window: await navigator.prepare({}), entries, onAborted, onWarning, listener };
}
function browser(result: BrowserResult) {
    return { open: vi.fn(async () => result), close: vi.fn(() => Promise.resolve()) };
}

describe("[Capacitor auth browser]", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        bridge.finished = undefined;
        bridge.open.mockReset().mockResolvedValue(undefined);
        bridge.close.mockReset().mockResolvedValue(undefined);
        vi.stubGlobal("window", { location: { reload } });
    });
    afterEach(() => {
        for (const configId of configIds.splice(0)) cleanupExternalRedirectUrlContext({ configId });
        vi.unstubAllGlobals();
    });

    it("persists a validated state-only logout callback and closes the native browser", async () => {
        const native = browser({ callbackUrl: callback });
        const flow = await start(native);
        await flow.window.navigate(logout);
        expect(native.open).toHaveBeenCalledWith({ ...logout, callbackUrl });
        expect([...flow.entries.values()].map(value => JSON.parse(value).url)).toEqual([callback]);
        expect(native.close).toHaveBeenCalledOnce();
        expect(reload).toHaveBeenCalledOnce();
        expect(bridge.open).not.toHaveBeenCalled();
        expect(bridge.close).not.toHaveBeenCalled();
    });

    it("reloads a committed handoff even when native dismissal fails", async () => {
        const native = browser({ callbackUrl: callback });
        native.close.mockRejectedValueOnce(new Error("dismissal failed"));
        const flow = await start(native);
        await flow.window.navigate(logout);
        expect([...flow.entries.values()].map(value => JSON.parse(value).url)).toEqual([callback]);
        expect(reload).toHaveBeenCalledOnce();
        expect(flow.onWarning).toHaveBeenCalledWith(
            expect.objectContaining({ code: "CAPACITOR_CLOSE_BROWSER_FAILED" })
        );
        expect(flow.onAborted).not.toHaveBeenCalled();
    });

    it("awaits sign-in persistence before opening the native browser", async () => {
        const order: string[] = [];
        const native = browser({ cancelled: true });
        native.open.mockImplementation(async () => {
            order.push("open");
            return { cancelled: true };
        });
        const flow = await start(native, async () => {
            await Promise.resolve();
            order.push("persist");
        });
        await flow.window.navigate({
            url: "https://issuer.example/auth?state=" + state,
            state,
            response_mode: "query"
        });
        expect(order).toEqual(["persist", "open"]);
    });

    it("emits the existing abort events and cleans listeners after cancellation", async () => {
        const flow = await start(browser({ cancelled: true }));
        await flow.window.navigate(logout);
        expect(flow.onAborted).toHaveBeenCalledOnce();
        expect(flow.listener).toHaveBeenCalledOnce();
        expect(bridge.removeApp).toHaveBeenCalledOnce();
        expect(bridge.removeBrowser).not.toHaveBeenCalled();
        expect(reload).not.toHaveBeenCalled();
    });

    it.each([
        ["default", () => undefined],
        ["explicit Capacitor Browser", () => Browser],
        ["injected asynchronous browser", () => browser(undefined)]
    ] as const)("uses the same App-Link callback flow with %s", async (_name, createBrowser) => {
        const authBrowser = createBrowser();
        const flow = await start(authBrowser);
        await flow.window.navigate(logout);
        const selected = authBrowser ?? Browser;
        expect(selected.open).toHaveBeenCalledExactlyOnceWith({ ...logout, callbackUrl });
        expect(flow.onAborted).not.toHaveBeenCalled();
        expect(reload).not.toHaveBeenCalled();
        await bridge.callback!({ url: callback });
        expect(selected.close).toHaveBeenCalledOnce();
        expect(reload).toHaveBeenCalledOnce();
        expect([...flow.entries.values()].map(value => JSON.parse(value).url)).toEqual([callback]);
        if (authBrowser !== undefined && authBrowser !== Browser) {
            expect(bridge.open).not.toHaveBeenCalled();
            expect(bridge.close).not.toHaveBeenCalled();
        }
    });

    it.each(["default", "injected"])("observes only the %s browser's dismissal event", async kind => {
        vi.useFakeTimers();
        try {
            let finished: (() => void) | undefined;
            const remove = vi.fn(async () => {});
            const custom: AuthBrowser = {
                ...browser(undefined),
                addListener: vi.fn(async (_name, listener) => {
                    finished = listener;
                    return { remove };
                })
            };
            const flow = await start(kind === "default" ? undefined : custom);
            await flow.window.navigate(logout);
            (kind === "default" ? bridge.finished : finished)!();
            await vi.advanceTimersByTimeAsync(
                CapacitorNavigator.DEFAULT_BROWSER_FINISHED_GRACE_PERIOD_MS
            );
            expect(flow.onAborted).toHaveBeenCalledOnce();
            expect(flow.listener).toHaveBeenCalledOnce();
            expect(bridge.removeApp).toHaveBeenCalledOnce();
            if (kind === "injected") {
                expect(remove).toHaveBeenCalledOnce();
                expect(Browser.addListener).not.toHaveBeenCalled();
            }
        } finally {
            vi.useRealTimers();
        }
    });

    it.each(["default", "injected"])(
        "aborts and preserves an open error with the %s browser",
        async kind => {
            const error = new Error("browser failed");
            const selected = kind === "default" ? undefined : browser(undefined);
            const open = selected?.open ?? bridge.open;
            const close = selected?.close ?? bridge.close;
            open.mockRejectedValueOnce(error);
            close.mockRejectedValueOnce(new Error("cleanup failed"));
            const flow = await start(selected);
            await expect(flow.window.navigate(logout)).rejects.toBe(error);
            expect(close).toHaveBeenCalledOnce();
            expect(flow.onAborted).toHaveBeenCalledOnce();
            expect(flow.listener).toHaveBeenCalledOnce();
            expect(bridge.removeApp).toHaveBeenCalledOnce();
        }
    );

    it("rejects a foreign callback URL and aborts the closed browser", async () => {
        const native = browser({
            callbackUrl: "https://untrusted.example/auth/callback?state=" + state
        });
        const flow = await start(native);
        await expect(flow.window.navigate(logout)).rejects.toThrow(
            "Authentication browser callback was rejected."
        );
        expect(flow.onWarning).toHaveBeenCalledWith(
            expect.objectContaining({ code: "CAPACITOR_CALLBACK_URL_BLOCKED" })
        );
        expect(flow.entries.size).toBe(0);
        expect(reload).not.toHaveBeenCalled();
        expect(native.close).toHaveBeenCalledOnce();
        expect(flow.onAborted).toHaveBeenCalledOnce();
        expect(flow.listener).toHaveBeenCalledOnce();
        expect(bridge.removeApp).toHaveBeenCalledOnce();
        expect(bridge.removeBrowser).not.toHaveBeenCalled();
    });

    it("rejects an invalid state and aborts the closed browser", async () => {
        const native = browser({ callbackUrl: callbackUrl + "?state=b2lkYy1zcGEuzyxwvutsrqponmlkjihg" });
        const flow = await start(native);
        await expect(flow.window.navigate(logout)).rejects.toThrow(
            "Authentication browser callback was rejected."
        );
        expect(flow.onWarning).toHaveBeenCalledWith(
            expect.objectContaining({ code: "CAPACITOR_CALLBACK_STATE_REJECTED" })
        );
        expect(flow.entries.size).toBe(0);
        expect(reload).not.toHaveBeenCalled();
        expect(native.close).toHaveBeenCalledOnce();
        expect(flow.onAborted).toHaveBeenCalledOnce();
    });

    it("lets a concurrent accepted callback win over cancellation", async () => {
        let finish!: (result: BrowserResult) => void;
        const native = {
            open: vi.fn(
                () =>
                    new Promise<BrowserResult>(resolve => {
                        finish = resolve;
                    })
            ),
            close: vi.fn(() => Promise.resolve())
        };
        native.close.mockRejectedValueOnce(new Error("dismissal failed"));
        const flow = await start(native);
        const navigating = flow.window.navigate(logout);
        await vi.waitFor(() => expect(native.open).toHaveBeenCalled());
        const accepting = bridge.callback!({ url: callback });
        finish({ cancelled: true });
        await Promise.all([accepting, navigating]);
        expect(reload).toHaveBeenCalledOnce();
        expect(flow.onAborted).not.toHaveBeenCalled();
        expect(flow.listener).not.toHaveBeenCalled();
    });

    it("preserves a native error when cleanup also fails and resets the auth flow", async () => {
        const error = new Error("native browser failed");
        const native = {
            open: vi.fn(() => Promise.reject(error)),
            close: vi.fn(() => Promise.reject(new Error("close failed")))
        };
        const flow = await start(native);
        await expect(flow.window.navigate(logout)).rejects.toBe(error);
        expect(bridge.open).not.toHaveBeenCalled();
        expect(native.close).toHaveBeenCalledOnce();
        expect(flow.onAborted).toHaveBeenCalledOnce();
        expect(flow.listener).toHaveBeenCalledOnce();
    });
});
