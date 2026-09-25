import assert from "node:assert/strict";
import { test, vi } from "vitest";
import { CAPACITOR_NAVIGATOR, CapacitorOidcService } from "../src/capacitor/angular";
import { CapacitorNavigator } from "../src/capacitor/CapacitorNavigator";
import { cleanupExternalRedirectUrlContext } from "../src/core/externalRedirectUrl";

const { opened } = vi.hoisted(() => ({ opened: [] as string[] }));

vi.mock("../src/angular", () => ({
    AbstractOidcService: class {
        static provide(params: unknown, providers: unknown) {
            return { params, providers };
        }
    }
}));

vi.mock("@angular/core", () => ({
    InjectionToken: class {
        constructor(public description: string) {}
    },
    inject() {}
}));

vi.mock("@capacitor/core", () => ({
    Capacitor: {
        isNativePlatform: () => true,
        getPlatform: async () => "android"
    }
}));

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
        open: async ({ url }: { url: string }) => {
            opened.push(url);
        }
    }
}));

type ProvideResult = {
    params: { navigator?: CapacitorNavigator };
    providers: Array<{ provide: unknown; useValue?: unknown }>;
};

const storage = {
    get length() {
        return Promise.resolve(0);
    },
    clear: async () => {},
    getItem: async () => null,
    key: async () => null,
    removeItem: async () => {},
    setItem: async () => {}
};

test("Capacitor provider passes the awaited hook to its real native navigator", async () => {
    const configId = "native-provider-hook";
    const observed: unknown[] = [];
    opened.length = 0;
    const result = CapacitorOidcService.provide({
        issuerUri: "https://issuer.example",
        clientId: "client",
        isNativeApp: true,
        beforeBrowserOpen: async request => {
            observed.push(request);
        }
    }) as unknown as ProvideResult;
    const navigator = result.providers.find(
        provider => provider.provide === CAPACITOR_NAVIGATOR
    )?.useValue;
    assert.ok(navigator instanceof CapacitorNavigator);

    try {
        await navigator.initialize({ tokenStorageAdapter: storage, configId });
        const browserWindow = await navigator.prepare({});
        const state = "provider-state";
        const url = `https://issuer.example/auth?state=${state}`;
        await browserWindow.navigate({ url, state, response_mode: "query" });
        assert.deepEqual(observed, [{ configId, authorizationUrl: url, state }]);
        assert.deepEqual(opened, [url]);
        browserWindow.close();
    } finally {
        cleanupExternalRedirectUrlContext({ configId });
    }
});

test("Capacitor provider leaves browser and PWA without a native navigator", () => {
    const result = CapacitorOidcService.provide({
        issuerUri: "https://issuer.example",
        clientId: "client",
        isNativeApp: false,
        persistAcceptedLaunchCallbackToTokenStorage: true,
        beforeBrowserOpen: async () => {
            throw new Error("should not run in PWA");
        }
    }) as unknown as ProvideResult;
    assert.equal(result.params.navigator, undefined);
    assert.equal(
        result.providers.some(provider => provider.provide === CAPACITOR_NAVIGATOR),
        false
    );
});

test("native hook with an externally supplied navigator fails closed", () => {
    for (const nativeOption of [
        { beforeBrowserOpen: async () => {} },
        { persistAcceptedLaunchCallbackToTokenStorage: true }
    ]) {
        assert.throws(
            () =>
                CapacitorOidcService.provide({
                    issuerUri: "https://issuer.example",
                    clientId: "client",
                    isNativeApp: true,
                    navigator: new CapacitorNavigator(),
                    ...nativeOption
                }),
            /native auth-flow options require the default CapacitorNavigator/
        );
    }
});
