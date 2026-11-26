import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";
import { test } from "node:test";
import { build } from "esbuild";

const { outputFiles, metafile } = await build({
    stdin: {
        contents: `
            export * from "./src/client";
            export { setHomeUrl_earlyInit } from "./src/core/earlyInit_homeUrl";
            export { setRootRelativeOriginalLocationHref_earlyInit } from "./src/core/earlyInit_rootRelativeOriginalLocationHref";
            export { enableCompatibilityModeHomeAsRedirectUri } from "./src/core/validRedirectUri";
        `,
        resolveDir: fileURLToPath(new URL("../../", import.meta.url))
    },
    bundle: true,
    platform: "node",
    format: "cjs",
    write: false,
    metafile: true,
    plugins: [
        {
            name: "real-oidc-fixture",
            setup(build) {
                build.onResolve({ filter: /^\.\.\/core$/ }, () => ({
                    path: "real-oidc",
                    namespace: "fixture"
                }));
                build.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({
                    contents:
                        "export const createOidc = params => globalThis.createOidc_fixture(params);"
                }));
            }
        }
    ]
});

function load({ browser = true, createOidc, useLegacyRedirectUri = false, initializeHomeUrl = true } = {}) {
    const module = { exports: {} };
    const location = new URL("https://app.test/app/");
    const document = {};
    const history = { replaceState: (_state, _title, url) => (location.href = url) };
    runInNewContext(outputFiles[0].text, {
        module,
        require: createRequire(import.meta.url),
        console,
        URL,
        URLSearchParams,
        setTimeout,
        clearTimeout,
        createOidc_fixture: createOidc,
        ...(browser
            ? {
                  window: { location, document, history, setTimeout, clearTimeout },
                  document,
                  navigator: {}
              }
            : {})
    });
    const api = module.exports;
    if (browser && initializeHomeUrl) api.setHomeUrl_earlyInit({ BASE_URL: "/app/" });
    if (useLegacyRedirectUri) api.enableCompatibilityModeHomeAsRedirectUri();
    api.setRootRelativeOriginalLocationHref_earlyInit({
        rootRelativeOriginalLocationHref: "/app/"
    });
    return api;
}

test("the adapter loads without React or framework dependencies", () => {
    for (const path of Object.keys(metafile.inputs)) {
        assert.doesNotMatch(path, /react|angular|tanstack/);
    }
    assert.equal(typeof load().oidcSpa.withUser, "function");
});

test("mock mode shares initialization and integrates user reads, refreshes and subscriptions", async () => {
    const { oidcSpa } = load();
    let configCalls = 0;
    const userCalls = [];
    const utils = oidcSpa
        .withUser(async params => {
            userCalls.push(params);
            // User factories can call authenticated APIs through the same utilities.
            const oidc = await utils.getOidc({ assert: "user logged in" });
            assert.equal(await oidc.getAccessToken(), "test-access-token");
            return { name: params.isMock ? "Mock user" : "Real user", revision: userCalls.length };
        })
        .withRuntimeConfigs(async () => {
            configCalls++;
            return {
                mode: "mock",
                clientId_mock: "test-client",
                issuerUri_mock: "https://auth.test",
                accessToken_mock: "test-access-token",
                refreshToken_mock: "test-refresh-token",
                idToken_mock: "test-id-token",
                idTokenClaims_mock: { sub: "test-sub" }
            };
        })
        .createUtils();

    assert.deepEqual(Object.keys(utils), ["getOidc"]);
    assert.equal(configCalls, 0);
    const [oidc, other] = await Promise.all([utils.getOidc(), utils.getOidc()]);
    assert.equal(oidc, other);
    assert.equal(configCalls, 1);
    assert.equal(oidc.isUserLoggedIn, true);
    assert.equal(oidc.clientId, "test-client");
    assert.equal(oidc.issuerUri, "https://auth.test");
    assert.equal(oidc.validRedirectUri, "https://app.test/app/openid-callback/");
    assert.equal(await oidc.getAccessToken(), "test-access-token");
    const tokens = await oidc.getTokens();
    assert.equal(tokens.refreshToken, "test-refresh-token");
    assert.equal(tokens.idToken, "test-id-token");

    const changes = [];
    const { unsubscribeFromUserChange } = oidc.subscribeToUserChange(change => changes.push(change));
    const user = await oidc.getUser();
    assert.deepEqual(user, { name: "Mock user", revision: 1 });
    assert.equal(await oidc.getUser(), user);
    assert.equal(userCalls[0].isMock, true);
    assert.equal(userCalls[0].idTokenClaims.sub, "test-sub");
    assert.equal(userCalls[0].user_current, undefined);
    await oidc.refreshUser();
    assert.deepEqual(await oidc.getUser(), { name: "Mock user", revision: 2 });
    assert.equal(userCalls[1].user_current, user);
    assert.equal(changes.length, 2);
    unsubscribeFromUserChange();
    await oidc.refreshUser();
    assert.equal(changes.length, 2);
    await assert.rejects(utils.getOidc({ assert: "user not logged in" }), /currently logged in/);
    assert.equal(await utils.getOidc({ assert: "user logged in" }), oidc);
});

test("mock mode supports logged-out users without creating a user", async () => {
    const { oidcSpa } = load();
    const { getOidc } = oidcSpa
        .withUser(() => assert.fail("must not create a logged-out user"))
        .withRuntimeConfigs({ mode: "mock", isUserInitiallyLoggedIn: false })
        .createUtils();
    const oidc = await getOidc({ assert: "user not logged in" });
    assert.equal(oidc.isUserLoggedIn, false);
    assert.equal(oidc.initializationError, undefined);
    assert.equal(typeof oidc.login, "function");
    await assert.rejects(getOidc({ assert: "user logged in" }), /not currently logged in/);
});

test("real mode forwards configuration and calls the user factory with isMock false", async () => {
    let received;
    const client = { isUserLoggedIn: true };
    const { oidcSpa } = load({
        createOidc: params => {
            received = params;
            return client;
        }
    });
    const runtimeConfigs = {
        mode: "real",
        issuerUri: "https://auth.test",
        clientId: "app",
        scopes: ["email"],
        disableDPoP: true,
        tokenParams: { audience: "api" },
        authorizationParams: { prompt: "consent" }
    };
    const { getOidc } = oidcSpa
        .withUser(({ isMock, idTokenClaims }) => ({ isMock, name: idTokenClaims.name }))
        .withRuntimeConfigs(runtimeConfigs)
        .createUtils();
    assert.equal(await getOidc(), client);
    for (const [key, value] of Object.entries(runtimeConfigs)) {
        if (key === "mode") continue;
        assert.equal(received[key], value);
    }
    assert.deepEqual(received.createUser({ idTokenClaims: { name: "Alice" } }), {
        isMock: false,
        name: "Alice"
    });
});

test("runtime config failures expose a stable initialization error", async () => {
    const { oidcSpa, OidcInitializationError } = load();
    const failure = new Error("config unavailable");
    const { getOidc } = oidcSpa
        .withUser(() => ({}))
        .withRuntimeConfigs(async () => {
            throw failure;
        })
        .createUtils();
    const oidc = await getOidc();
    assert.equal(oidc.isUserLoggedIn, false);
    assert(oidc.initializationError instanceof OidcInitializationError);
    assert.equal(oidc.initializationError.cause.cause, failure);
    assert.equal(await getOidc(), oidc);
    assert.equal(oidc.issuerUri, "https://not-resolved-yet");
    assert.equal(oidc.clientId, "not-resolved-yet");
    assert.equal(oidc.validRedirectUri, "https://app.test/app/openid-callback/");
});

test("real initialization failures use the public error type", async () => {
    let failure;
    const { oidcSpa, OidcInitializationError } = load({
        createOidc: () => {
            throw failure;
        }
    });
    failure = new OidcInitializationError({
        isAuthServerLikelyDown: true,
        messageOrCause: "provider unavailable"
    });
    const { getOidc } = oidcSpa
        .withUser(() => ({}))
        .withRuntimeConfigs({ mode: "real", issuerUri: "https://auth.test", clientId: "app" })
        .createUtils();
    const oidc = await getOidc();
    assert.equal(oidc.initializationError, failure);
    assert.equal(oidc.issuerUri, "https://auth.test");
    assert.equal(oidc.clientId, "app");
    assert.equal(oidc.validRedirectUri, "https://app.test/app/openid-callback/");
});

for (const issuerUri of ["/realms/demo/", "https://auth.test/realms/demo/"]) {
    test(`failed client metadata preserves the error and handles issuer ${issuerUri}`, async () => {
        let failure;
        const { oidcSpa, OidcInitializationError } = load({
            createOidc: () => {
                throw failure;
            }
        });
        failure = new OidcInitializationError({
            isAuthServerLikelyDown: false,
            messageOrCause: "initialization failed"
        });
        const { getOidc } = oidcSpa
            .withUser(() => ({}))
            .withRuntimeConfigs({ mode: "real", issuerUri, clientId: "configured-client" })
            .createUtils();
        const oidc = await getOidc();
        assert.equal(oidc.initializationError, failure);
        assert.equal(
            oidc.issuerUri,
            issuerUri.startsWith("/") ? "https://app.test/realms/demo" : "https://auth.test/realms/demo"
        );
        assert.equal(oidc.clientId, "configured-client");
        assert.equal(oidc.validRedirectUri, "https://app.test/app/openid-callback/");
    });
}

test("server reads fail before evaluating runtime configs", async () => {
    const { oidcSpa } = load({ browser: false });
    const { getOidc } = oidcSpa
        .withUser(() => ({}))
        .withRuntimeConfigs(() => assert.fail("must not initialize on the server"))
        .createUtils();
    await assert.rejects(getOidc(), /can't be used on the server/);
});

test("legacy redirect URIs agree in mock mode and initialization failures", async () => {
    const { oidcSpa } = load({ useLegacyRedirectUri: true });
    for (const runtimeConfigs of [
        { mode: "mock", isUserInitiallyLoggedIn: false },
        () => { throw new Error("config unavailable"); }
    ]) {
        const { getOidc } = oidcSpa.withUser(() => ({})).withRuntimeConfigs(runtimeConfigs).createUtils();
        assert.equal((await getOidc()).validRedirectUri, "https://app.test/app/");
    }
});

test("failed initialization exposes the redirect URI once the home URL becomes known", async () => {
    const { oidcSpa, setHomeUrl_earlyInit } = load({ initializeHomeUrl: false });
    const { getOidc } = oidcSpa.withUser(() => ({})).withRuntimeConfigs(() => {
        throw new Error("config unavailable");
    }).createUtils();
    const oidc = await getOidc();
    assert.equal(oidc.validRedirectUri, "redirect-uri-is-unknown");
    setHomeUrl_earlyInit({ BASE_URL: "/app/" });
    assert.equal(oidc.validRedirectUri, "https://app.test/app/openid-callback/");
});
