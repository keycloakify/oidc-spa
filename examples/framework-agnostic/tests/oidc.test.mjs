import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { isReadonly } from "vue";

const { outputFiles } = await build({
    entryPoints: [fileURLToPath(new URL("../src/oidc.ts", import.meta.url))],
    bundle: true,
    platform: "node",
    format: "cjs",
    packages: "external",
    write: false,
    loader: { ".svg": "dataurl" },
    define: {
        "import.meta.env": JSON.stringify({ BASE_URL: "/", VITE_OIDC_PROVIDER: "mock" })
    },
    plugins: [
        {
            name: "oidc-client-fixture",
            setup(build) {
                build.onResolve({ filter: /^oidc-spa\/framework-agnostic$/ }, () => ({
                    path: "oidc-client",
                    namespace: "fixture"
                }));
                build.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({
                    contents: `export const oidcSpa = {
                    withUser() { return this; },
                    withRuntimeConfigs() { return this; },
                    createUtils() { return { getOidc: () => globalThis.getOidcFixture() }; }
                };`
                }));
            }
        }
    ]
});

function load(core, { href = "https://app.test/", fetch = () => assert.fail("unexpected fetch") } = {}) {
    const module = { exports: {} };
    runInNewContext(outputFiles[0].text, {
        module,
        require: createRequire(import.meta.url),
        console,
        Error,
        URL,
        Headers,
        Request,
        fetch,
        window: { location: new URL(href) },
        getOidcFixture: async () => core
    });
    return { api: module.exports };
}

function loggedIn() {
    const user = { displayName: "Alice", canSeeAdminNavigation: true };
    let onUserChange;
    let onAutoLogoutState;
    let userReads = 0;
    const core = {
        isUserLoggedIn: true,
        subscribeToUserChange: callback => {
            onUserChange = callback;
            return { unsubscribeFromUserChange: () => {} };
        },
        subscribeToAutoLogoutState: callback => {
            onAutoLogoutState = callback;
            return { unsubscribeFromAutoLogoutState: () => {} };
        },
        getUser: async () => {
            userReads++;
            assert(onUserChange, "subscribe before initializing the user");
            return user;
        },
        getAccessToken: async () => "access-token"
    };
    return {
        core,
        user,
        changeUser: user => onUserChange({ user }),
        warn: state => onAutoLogoutState(state),
        get userReads() {
            return userReads;
        }
    };
}

test("initialization connects the OIDC client to readonly Vue refs", async () => {
    const fixture = loggedIn();
    const { api } = load(fixture.core);
    const state = api.useOidc();
    await api.initializeOidc();
    assert.equal(fixture.userReads, 1);
    assert.equal(state.oidc.value, fixture.core);
    assert.equal(state.user.value, fixture.user);
    assert(isReadonly(state.user));
    assert(isReadonly(state.oidc));

    const refreshed = { ...fixture.user, displayName: "Updated" };
    fixture.changeUser(refreshed);
    assert.equal(state.user.value, refreshed);
    const warning = { shouldDisplayWarning: true, secondsLeftBeforeAutoLogout: 10 };
    fixture.warn(warning);
    assert.equal(state.autoLogoutState.value, warning);
    await api.enforceLogin("/account");
    assert.equal(fixture.userReads, 1);
});

test("initialization lets user creation failures propagate", async () => {
    const fixture = loggedIn();
    const failure = new Error("Profile unavailable");
    fixture.core.getUser = async () => {
        throw failure;
    };
    const { api } = load(fixture.core);
    await assert.rejects(api.initializeOidc(), error => error === failure);
});

test("the login guard propagates provider initialization errors", async () => {
    const failure = new Error("Provider unavailable");
    const { api } = load({
        isUserLoggedIn: false,
        initializationError: failure,
        login: () => assert.fail("must not attempt login after failed initialization")
    });
    await api.initializeOidc();
    await assert.rejects(api.enforceLogin("/account"), error => error === failure);
});

test("the login guard preserves the destination, query, hash, and base path", async () => {
    for (const href of ["https://app.test/base/", "https://app.test/base/account?tab=profile#name"]) {
        let loginParams;
        const { api } = load(
            {
                isUserLoggedIn: false,
                initializationError: undefined,
                login: async params => {
                    loginParams = params;
                }
            },
            { href }
        );
        await api.enforceLogin("/base/account?tab=profile#name");
        assert.equal(loginParams.returnToUrl, "https://app.test/base/account?tab=profile#name");
        assert.equal(loginParams.doesCurrentHrefEnforceLogin, href === loginParams.returnToUrl);
        assert.equal(api.useOidc().user.value, undefined);
    }
});

test("authenticated fetch preserves Request headers and obtains a current token", async () => {
    const fixture = loggedIn();
    let request;
    const { api } = load(fixture.core, {
        fetch: (input, init) => {
            request = { input, init };
        }
    });
    const input = new Request("https://app.test/api/todos", { headers: { "X-Example": "present" } });
    await api.fetchWithAuth(input);
    assert.equal(request.input, input);
    assert.equal(request.init.headers.get("X-Example"), "present");
    assert.equal(request.init.headers.get("Authorization"), "Bearer access-token");
});

test("logged-out fetch forwards the original request without an authorization header", async () => {
    let request;
    const { api } = load(
        { isUserLoggedIn: false },
        {
            fetch: (input, init) => {
                request = { input, init };
            }
        }
    );
    const init = { headers: { "X-Example": "present" } };
    await api.fetchWithAuth("/api/todos", init);
    assert.equal(request.input, "/api/todos");
    assert.equal(request.init, init);
});
