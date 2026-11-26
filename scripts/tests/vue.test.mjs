import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";
import { test } from "node:test";
import { build } from "esbuild";
import { createHydrationRenderer, createRenderer, defineComponent, h, isReadonly, isRef, nextTick } from "vue";
import { parse, compileScript } from "vue/compiler-sfc";
import { renderToString } from "vue/server-renderer";

const { outputFiles, metafile } = await build({
    stdin: {
        contents: `
            export * from "./src/vue";
            export { setSsr_earlyInit } from "./src/core/earlyInit_ssr";
            export { setHomeUrl_earlyInit } from "./src/core/earlyInit_homeUrl";
            export { setRootRelativeOriginalLocationHref_earlyInit } from "./src/core/earlyInit_rootRelativeOriginalLocationHref";
            export { enableCompatibilityModeHomeAsRedirectUri } from "./src/core/validRedirectUri";
        `,
        resolveDir: fileURLToPath(new URL("../../", import.meta.url))
    },
    bundle: true,
    platform: "node",
    format: "cjs",
    external: ["vue"],
    write: false,
    metafile: true,
    plugins: [
        {
            name: "real-oidc-fixture",
            setup(build) {
                build.onResolve({ filter: /^\.\.\/core$/ }, args =>
                    args.importer.endsWith("/vue/createUtils.ts")
                        ? { path: "real-oidc", namespace: "fixture" }
                        : undefined
                );
                build.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({
                    contents:
                        "export const createOidc = params => globalThis.createOidc_fixture(params);"
                }));
            }
        }
    ]
});

// Compile the same reactive consumer that vue-tsc checks, including its template.
const consumerUrl = new URL("../../tests/vue/Consumer.vue", import.meta.url);
const { descriptor } = parse(readFileSync(consumerUrl, "utf8"), { filename: consumerUrl.pathname });
const consumerScript = compileScript(descriptor, { id: "oidc-consumer", inlineTemplate: true });
const consumerBuild = await build({
    stdin: { contents: consumerScript.content, loader: "ts" },
    format: "cjs",
    write: false
});
const consumerModule = { exports: {} };
runInNewContext(consumerBuild.outputFiles[0].text, {
    module: consumerModule,
    require: createRequire(import.meta.url)
});
const Consumer = consumerModule.exports.default;

function load({ browser = true, createOidc, useLegacyRedirectUri = false, initializeHomeUrl = true } = {}) {
    const module = { exports: {} };
    const location = new URL("https://app.test/app/");
    let reloads = 0;
    location.reload = () => reloads++;
    const document = {};
    const listeners = new Map();
    const history = {
        pushState: (_state, _title, url) => (location.href = new URL(url, location).href),
        replaceState: (_state, _title, url) => (location.href = new URL(url, location).href)
    };
    const window = {
        location,
        document,
        history,
        setTimeout,
        clearTimeout,
        addEventListener: (type, listener) => listeners.set(type, listener),
        removeEventListener: (type, listener) => {
            if (listeners.get(type) === listener) listeners.delete(type);
        }
    };
    runInNewContext(outputFiles[0].text, {
        module,
        require: createRequire(import.meta.url),
        console,
        URL,
        URLSearchParams,
        setTimeout,
        clearTimeout,
        alert() {},
        createOidc_fixture: createOidc,
        ...(browser ? { window, document, navigator: {} } : {})
    });
    const api = module.exports;
    if (browser && initializeHomeUrl) api.setHomeUrl_earlyInit({ BASE_URL: "/app/" });
    if (useLegacyRedirectUri) api.enableCompatibilityModeHomeAsRedirectUri();
    api.setRootRelativeOriginalLocationHref_earlyInit({
        rootRelativeOriginalLocationHref: "/app/"
    });
    return { ...api, location, history, listeners, getReloads: () => reloads };
}

// Exercise real Vue component lifecycles and reactivity without a browser DOM.
const rendererOptions = {
    createElement: type => ({ type, children: [], props: {} }),
    createText: text => ({ text }),
    createComment: () => ({ text: "" }),
    setText: (node, text) => (node.text = text),
    setElementText: (node, text) => (node.children = [{ text }]),
    parentNode: node => node.parent,
    nextSibling: node => {
        const siblings = node.parent?.children ?? [];
        return siblings[siblings.indexOf(node) + 1];
    },
    patchProp: (node, key, _previous, value) => (node.props[key] = value),
    insert(node, parent, anchor) {
        if (node.parent) {
            const siblings = node.parent.children;
            siblings.splice(siblings.indexOf(node), 1);
        }
        const index = anchor ? parent.children.indexOf(anchor) : -1;
        parent.children.splice(index < 0 ? parent.children.length : index, 0, node);
        node.parent = parent;
    },
    remove(node) {
        const siblings = node.parent?.children;
        if (siblings) siblings.splice(siblings.indexOf(node), 1);
        node.parent = undefined;
    }
};
const renderer = createRenderer(rendererOptions);

function mount(component) {
    const root = { children: [] };
    const errors = [];
    const app = renderer.createApp(component);
    app.config.errorHandler = error => errors.push(error);
    app.mount(root);
    return { root, errors, unmount: () => app.unmount() };
}

function text(node) {
    return node.text ?? (node.children ?? []).map(text).join("");
}

const flush = async () => {
    await new Promise(resolve => setImmediate(resolve));
    await nextTick();
};

const realConfigs = { mode: "real", issuerUri: "https://auth.test", clientId: "app" };

function loggedOut(login = () => new Promise(() => {})) {
    return {
        isUserLoggedIn: false,
        issuerUri: "https://auth.test",
        clientId: "app",
        validRedirectUri: "https://app.test/app/openid-callback/",
        initializationError: undefined,
        login
    };
}

test("Vue export exposes router-based utilities without a React runtime dependency", () => {
    for (const path of Object.keys(metafile.inputs)) {
        assert.doesNotMatch(path, /react|angular|tanstack/);
    }
    const { oidcSpa } = load();
    const utils = oidcSpa
        .withUser(() => ({}))
        .withRuntimeConfigs({ mode: "mock" })
        .createUtils();
    assert.deepEqual(Object.keys(utils).sort(), [
        "enforceLogin",
        "getOidc",
        "useOidc"
    ]);
    const state = utils.useOidc();
    assert.equal(state.value.isOidcReady, false);
    assert.equal("suspensePromise" in state.value, false);
    assert.equal("withLoginEnforced" in utils, false);
});

test("useOidc initializes on mount and renders both states", async () => {
    const { oidcSpa } = load();
    let configCalls = 0;
    const utils = oidcSpa
        .withUser(() => assert.fail("must not create a logged-out user"))
        .withRuntimeConfigs(() => {
            configCalls++;
            return { mode: "mock", isUserInitiallyLoggedIn: false };
        })
        .createUtils();
    const app = mount(
        defineComponent({
            setup() {
                const { isOidcReady } = utils.useOidc();
                assert.equal(configCalls, 0);
                return () => (isOidcReady.value ? "Ready" : "Loading");
            }
        })
    );
    assert.equal(text(app.root), "Loading");
    await flush();
    assert.equal(text(app.root), "Ready");
    assert.equal(configCalls, 1);
    assert.deepEqual(app.errors, []);
    app.unmount();
});

test("the app renders during user creation and user refs update after refresh", async () => {
    const { oidcSpa } = load();
    let finishUser;
    const pendingUser = new Promise(resolve => (finishUser = resolve));
    let configCalls = 0;
    let userCalls = 0;
    let currentUser;
    const utils = oidcSpa
        .withUser(async ({ user_current }) => {
            userCalls++;
            currentUser = user_current;
            // Authenticated requests made by createUser must not deadlock.
            const oidc = await utils.getOidc({ assert: "user logged in" });
            assert.equal(await oidc.getAccessToken(), "mocked-access-token");
            if (userCalls === 1) await pendingUser;
            return { name: `User ${userCalls}`, canSeeAdminNavigation: true };
        })
        .withRuntimeConfigs(async () => {
            configCalls++;
            return { mode: "mock" };
        })
        .createUtils();
    const app = mount(() =>
        h("main", [
            h("p", "Public page"),
            h(Consumer, { useOidc: utils.useOidc }),
            h(Consumer, { useOidc: utils.useOidc })
        ])
    );
    const { user: projectedUser } = utils.useOidc();
    assert.equal(text(app.root), "Public page");
    assert.equal(projectedUser.value, undefined);
    await flush();
    assert.equal(configCalls, 1);
    assert.equal(text(app.root), "Public page");
    const [oidc, other] = await Promise.all([utils.getOidc(), utils.getOidc()]);
    assert.equal(oidc, other);
    finishUser();
    await flush();
    assert.equal(text(app.root), "Public pageUser 1User 1");
    const { user: userRef } = utils.useOidc({ assert: "user logged in" });
    assert(isRef(userRef));
    assert(isReadonly(userRef));
    const firstUser = await oidc.getUser();
    assert.equal(userRef.value, firstUser);
    assert.equal(projectedUser.value, firstUser);
    await oidc.refreshUser();
    await nextTick();
    assert.equal(currentUser, firstUser);
    assert.equal(text(app.root), "Public pageUser 2User 2");
    assert.equal(projectedUser.value, userRef.value);
    assert.equal(configCalls, 1);
    assert.throws(() => utils.useOidc({ assert: "user not logged in" }), /logic error/);
    await assert.rejects(utils.getOidc({ assert: "user not logged in" }), /currently logged in/);
    assert.equal(app.errors.length, 0);
    app.unmount();
});

test("configuration failures render public content and throw from enforceLogin", async () => {
    const { oidcSpa, OidcInitializationError } = load();
    const cause = new Error("runtime configuration unavailable");
    const utils = oidcSpa
        .withUser(() => assert.fail("no user"))
        .withRuntimeConfigs(async () => {
            throw cause;
        })
        .createUtils();
    const app = mount(() =>
        h("main", [h("p", "Public page"), h(Consumer, { useOidc: utils.useOidc })])
    );
    assert.equal(text(app.root), "Public page");
    await flush();
    assert.equal(text(app.root), "Public page");
    const state = utils.useOidc().value;
    assert.equal(state.isOidcReady, false);
    assert(state.initializationError instanceof OidcInitializationError);
    assert.equal(state.initializationError.cause.cause, cause);
    const oidc = await utils.getOidc();
    assert.equal(oidc.initializationError, state.initializationError);
    assert.equal(oidc.issuerUri, "https://not-resolved-yet");
    assert.equal(oidc.clientId, "not-resolved-yet");
    assert.equal(oidc.validRedirectUri, "https://app.test/app/openid-callback/");
    await assert.rejects(oidc.login({ doesCurrentHrefEnforceLogin: false }), error => {
        assert.equal(error, state.initializationError);
        return true;
    });
    assert.throws(() => utils.useOidc({ assert: "user logged in" }), /logic error/);
    await assert.rejects(utils.enforceLogin({ fullPath: "https://app.test/app/account" }), error => {
        assert.equal(error, oidc.initializationError);
        return true;
    });
    app.unmount();
});

test("reactive template consumers safely skip user access when logged out", async () => {
    const { oidcSpa } = load();
    const utils = oidcSpa
        .withUser(() => assert.fail("a logged-out client has no user"))
        .withRuntimeConfigs({ mode: "mock", isUserInitiallyLoggedIn: false })
        .createUtils();
    const app = mount(() => h(Consumer, { useOidc: utils.useOidc }));
    await flush();
    assert.equal(text(app.root), "");
    assert.equal(utils.useOidc().value.isUserLoggedIn, false);
    assert.equal(app.errors.length, 0);
    app.unmount();
});

test("user-change notifications update rendered consumers even when user identity is retained", async () => {
    const user = { revision: 1 };
    let publishUser;
    const { oidcSpa } = load({
        createOidc: () => ({
            ...loggedOut(),
            isUserLoggedIn: true,
            getUser: async () => user,
            subscribeToUserChange: callback => {
                publishUser = callback;
                return { unsubscribeFromUserChange() {} };
            },
            subscribeToAutoLogoutState: () => ({ unsubscribeFromAutoLogoutState() {} })
        })
    });
    const utils = oidcSpa
        .withUser(() => user)
        .withRuntimeConfigs(realConfigs)
        .createUtils();
    const Child = defineComponent({
        setup() {
            const { user } = utils.useOidc({ assert: "user logged in" });
            return () => String(user.value.revision);
        }
    });
    await utils.enforceLogin({ fullPath: "/" });
    const app = mount(Child);
    await flush();
    const oidc = await utils.getOidc();
    assert.equal(text(app.root), "1");
    user.revision++;
    publishUser({ user });
    await nextTick();
    assert.equal(await oidc.getUser(), user);
    assert.equal(text(app.root), "2");
    app.unmount();
});

test("a client with an already cached user populates the Vue ref", async () => {
    const user = { name: "Cached user" };
    const { oidcSpa } = load({
        createOidc: () => ({
            ...loggedOut(),
            isUserLoggedIn: true,
            getUser: async () => user,
            subscribeToUserChange: () => ({ unsubscribeFromUserChange() {} }),
            subscribeToAutoLogoutState: () => ({ unsubscribeFromAutoLogoutState() {} })
        })
    });
    const utils = oidcSpa
        .withUser(() => ({}))
        .withRuntimeConfigs(realConfigs)
        .createUtils();
    await utils.enforceLogin({ fullPath: "https://app.test/app/" });
    assert.equal(utils.useOidc({ assert: "user logged in" }).user.value, user);
});

test("a failed user factory cannot pass a protected route guard", async () => {
    const { oidcSpa, OidcInitializationError } = load();
    const utils = oidcSpa
        .withUser(async () => {
            throw new Error("invalid claims");
        })
        .withRuntimeConfigs({ mode: "mock" })
        .createUtils();
    const app = mount(() =>
        h("main", [h("p", "Public page"), h(Consumer, { useOidc: utils.useOidc })])
    );
    await flush();
    const state = utils.useOidc().value;
    assert.equal(state.isOidcReady, false);
    assert(state.initializationError instanceof OidcInitializationError);
    await assert.rejects(utils.enforceLogin({ fullPath: "https://app.test/app/account" }), error => {
        assert.equal(error, state.initializationError);
        return true;
    });
    assert.equal(text(app.root), "Public page");
    app.unmount();
});

for (const fullPath of ["/", "/account?tab=profile#details"]) {
    test(`route protection waits for user creation without a mounted component: ${fullPath}`, async () => {
        const { oidcSpa } = load();
        let finishUser;
        const pendingUser = new Promise(resolve => (finishUser = resolve));
        let token;
        const user = { name: "Alice" };
        const utils = oidcSpa
            .withUser(async () => {
                const oidc = await utils.getOidc({ assert: "user logged in" });
                token = await oidc.getAccessToken();
                await pendingUser;
                return user;
            })
            .withRuntimeConfigs({ mode: "mock" })
            .createUtils();
        let activated = false;
        const guard = utils.enforceLogin({ fullPath }).then(() => (activated = true));
        await flush();
        assert.equal(token, "mocked-access-token");
        assert.equal(activated, false);
        assert.equal(utils.useOidc().value.isOidcReady, false);
        finishUser();
        await guard;
        assert.equal(activated, true);
        assert.equal(utils.useOidc({ assert: "user logged in" }).user.value, user);
    });

    test(`route protection throws user-creation errors without a mounted component: ${fullPath}`, async () => {
        const { oidcSpa, OidcInitializationError } = load();
        const cause = new Error("profile unavailable");
        const utils = oidcSpa
            .withUser(() => {
                throw cause;
            })
            .withRuntimeConfigs({ mode: "mock" })
            .createUtils();
        let failure;
        await assert.rejects(utils.enforceLogin({ fullPath }), error => {
            failure = error;
            return error instanceof OidcInitializationError && error.message.includes(cause.message);
        });
        assert.equal(utils.useOidc().value.initializationError, failure);
        const oidc = await utils.getOidc({ assert: "user logged in" });
        assert.equal(await oidc.getAccessToken(), "mocked-access-token");
    });
}

for (const issuerUri of ["/realms/demo/", "https://auth.test/realms/demo/"]) {
    test(`Vue exposes failed client metadata without obscuring the error: ${issuerUri}`, async () => {
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
        const utils = oidcSpa
            .withUser(() => ({}))
            .withRuntimeConfigs({
                mode: "real",
                issuerUri,
                clientId: "configured-client"
            })
            .createUtils();
        const app = mount(
            defineComponent({
                setup() {
                    const { initializationError } = utils.useOidc();
                    return () => h("span", initializationError.value?.message ?? "Loading");
                }
            })
        );
        await flush();
        assert.equal(text(app.root), failure.message);
        const state = utils.useOidc().value;
        assert.equal(state.isOidcReady, false);
        assert.equal(state.initializationError, failure);
        const oidc = await utils.getOidc();
        assert.equal(
            oidc.issuerUri,
            issuerUri.startsWith("/") ? "https://app.test/realms/demo" : "https://auth.test/realms/demo"
        );
        assert.equal(oidc.clientId, "configured-client");
        assert.equal(app.errors.length, 0);
        await assert.rejects(
            utils.enforceLogin({ fullPath: "https://app.test/app/account" }),
            error => error === failure
        );
        app.unmount();
    });
}

test("logged-out guards preserve the base path, query and fragment and stay pending", async () => {
    const calls = [];
    const { oidcSpa } = load({
        createOidc: () =>
            loggedOut(params => {
                calls.push(params);
                return new Promise(() => {});
            })
    });
    const utils = oidcSpa
        .withUser(() => ({}))
        .withRuntimeConfigs(realConfigs)
        .createUtils();
    let completed = false;
    void utils.enforceLogin({ fullPath: "/account?tab=profile#details" }).then(() => (completed = true));
    await flush();
    assert.equal(completed, false);
    assert.equal(calls[0].returnToUrl, "https://app.test/app/account?tab=profile#details");
    assert.equal(calls[0].doesCurrentHrefEnforceLogin, false);
    void utils.enforceLogin({ fullPath: "/" });
    await flush();
    assert.equal(calls[1].doesCurrentHrefEnforceLogin, true);
    void utils.useOidc({ assert: "user not logged in" }).login();
    assert.equal(calls[2].doesCurrentHrefEnforceLogin, false);
});

test("auto-logout refs update consumers; pending navigation token redirects match React", async () => {
    let publishUser;
    let publishAutoLogout;
    const tokenCalls = [];
    const client = {
        ...loggedOut(),
        isUserLoggedIn: true,
        getUser: async () => {
            publishUser({ user: { name: "Alice" } });
        },
        subscribeToUserChange: callback => {
            publishUser = callback;
            return { unsubscribeFromUserChange() {} };
        },
        subscribeToAutoLogoutState: callback => {
            publishAutoLogout = callback;
            return { unsubscribeFromAutoLogoutState() {} };
        },
        getTokens: async params => {
            tokenCalls.push(params);
            return { accessToken: "token" };
        }
    };
    const { oidcSpa, history, listeners } = load({ createOidc: () => client });
    const utils = oidcSpa
        .withUser(() => ({}))
        .withRuntimeConfigs(realConfigs)
        .createUtils();
    const app = mount(
        defineComponent({
            setup() {
                const { autoLogoutState } = utils.useOidc();
                return () => {
                    return autoLogoutState.value.shouldDisplayWarning
                        ? String(autoLogoutState.value.secondsLeftBeforeAutoLogout)
                        : "No warning";
                };
            }
        })
    );
    assert.equal(text(app.root), "No warning");
    await flush();
    assert.equal(text(app.root), "No warning");
    const state = {
        shouldDisplayWarning: true,
        secondsLeftBeforeAutoLogout: 12,
        resetAutoLogoutCountdown() {}
    };
    publishAutoLogout(state);
    await nextTick();
    assert.equal(text(app.root), "12");
    assert.equal(utils.useOidc().autoLogoutState.value, state);
    assert.equal(utils.useOidc().value.autoLogoutState.value, state);
    const oidc = await utils.getOidc();
    const originalPushState = history.pushState;
    await utils.enforceLogin({ fullPath: "https://app.test/app/account?tab=profile" });
    assert.equal(await oidc.getAccessToken({ doForceRefresh: true }), "token");
    assert.equal(tokenCalls.at(-1).returnToUrl, "https://app.test/app/account?tab=profile");
    await oidc.getAccessToken({ doForceRefresh: true, returnToUrl: "https://app.test/app/explicit" });
    assert.equal(tokenCalls.at(-1).returnToUrl, "https://app.test/app/explicit");
    history.pushState({}, "", "https://app.test/app/account?tab=profile");
    assert.equal(history.pushState, originalPushState);
    assert.equal(listeners.size, 0);
    await oidc.getTokens({ doForceRefresh: true });
    assert.equal(tokenCalls.at(-1).returnToUrl, undefined);
    await utils.enforceLogin({ fullPath: "https://app.test/app/other" });
    listeners.get("popstate")();
    assert.equal(history.pushState, originalPushState);
    app.unmount();
});

test("token requests preserve the pending destination while the guard waits for user creation", async () => {
    let finishUser;
    let publishUser;
    const pendingUser = new Promise(resolve => (finishUser = resolve));
    const tokenCalls = [];
    const user = { name: "Alice" };
    const { oidcSpa } = load({
        createOidc: () => ({
            ...loggedOut(),
            isUserLoggedIn: true,
            subscribeToAutoLogoutState: () => ({ unsubscribeFromAutoLogoutState() {} }),
            subscribeToUserChange: callback => {
                publishUser = callback;
                return { unsubscribeFromUserChange() {} };
            },
            getUser: async () => {
                const oidc = await utils.getOidc({ assert: "user logged in" });
                await oidc.getAccessToken({ doForceRefresh: true });
                await pendingUser;
                publishUser({ user });
                return user;
            },
            getTokens: async params => {
                tokenCalls.push(params);
                return { accessToken: "token" };
            }
        })
    });
    const utils = oidcSpa
        .withUser(() => user)
        .withRuntimeConfigs(realConfigs)
        .createUtils();
    const guard = utils.enforceLogin({ fullPath: "/account?tab=profile#details" });
    await flush();
    assert.equal(utils.useOidc().value.isOidcReady, false);
    assert.equal(tokenCalls[0].returnToUrl, "https://app.test/app/account?tab=profile#details");
    finishUser();
    await guard;
    assert.equal(utils.useOidc({ assert: "user logged in" }).user.value, user);
});

for (const stage of ["client", "user"]) {
    test(`unexpected ${stage} errors propagate to Vue's component error handler and route guards`, async t => {
        const failure = new Error("unexpected failure");
        const log = t.mock.method(console, "error", () => {});
        const { oidcSpa } = load({
            createOidc: () => {
                if (stage === "client") throw failure;
                return {
                    ...loggedOut(),
                    isUserLoggedIn: true,
                    getUser: async () => {
                        throw failure;
                    },
                    subscribeToUserChange: () => ({ unsubscribeFromUserChange() {} }),
                    subscribeToAutoLogoutState: () => ({ unsubscribeFromAutoLogoutState() {} })
                };
            }
        });
        const utils = oidcSpa
            .withUser(() => ({}))
            .withRuntimeConfigs(realConfigs)
            .createUtils();
        const app = mount(
            defineComponent({
                setup() {
                    const oidc = utils.useOidc();
                    return () => (oidc.value.isOidcReady ? "Ready" : "Loading");
                }
            })
        );
        let settled = false;
        void utils.getOidc().then(
            () => (settled = true),
            () => (settled = true)
        );
        await flush();
        assert.equal(app.errors[0], failure);
        assert.equal(settled, stage === "user");
        if (stage === "client") assert.equal(log.mock.calls[0]?.arguments[0], failure);
        await assert.rejects(utils.enforceLogin({ fullPath: "/account" }), error => error === failure);
        app.unmount();
    });
}

test("server imports and reads never initialize browser authentication", async () => {
    const { oidcSpa } = load({ browser: false });
    const utils = oidcSpa
        .withUser(() => ({}))
        .withRuntimeConfigs(() => assert.fail("server initialization"))
        .createUtils();
    assert.equal(utils.useOidc().value.isOidcReady, false);
    assert.throws(() => utils.useOidc({ assert: "user not logged in" }), /on the server/);
    await assert.rejects(utils.getOidc(), /can't be used on the server/);
    await assert.rejects(
        utils.enforceLogin({ fullPath: "https://app.test/app/account" }),
        /cannot be used on the server/
    );
    const markup = await renderToString(
        h("main", [
            h("p", "Public page"),
            h(defineComponent({
                setup() {
                    const oidc = utils.useOidc();
                    return () => h("span", oidc.value.isOidcReady ? "Ready" : "Loading");
                }
            }))
        ])
    );
    assert.equal(markup, "<main><p>Public page</p><span>Loading</span></main>");
});

test("SSR-enabled hydration starts pending even when OIDC is already initialized", async () => {
    function createComponent(api, getRuntimeConfigs) {
        const { useOidc, getOidc } = api.oidcSpa
            .withUser(() => assert.fail("must not create a logged-out user"))
            .withRuntimeConfigs(getRuntimeConfigs)
            .createUtils();
        const Component = defineComponent({
            setup() {
                const { isOidcReady } = useOidc();
                return () => (isOidcReady.value ? "Ready" : "Loading");
            }
        });
        return { Component, getOidc, useOidc };
    }

    const server = createComponent(load({ browser: false }), () => assert.fail("server initialization"));
    const markup = await renderToString(h(server.Component));
    assert.equal(markup, "Loading");

    const api = load();
    api.setSsr_earlyInit({ ssr: true });
    const client = createComponent(api, () => ({ mode: "mock", isUserInitiallyLoggedIn: false }));
    await client.getOidc();
    assert.equal(client.useOidc().value.isOidcReady, true);

    const root = {
        children: [],
        hasChildNodes() { return this.children.length !== 0; },
        get firstChild() { return this.children[0]; }
    };
    const serverNode = { nodeType: 3, data: markup, text: markup, parent: root };
    root.children.push(serverNode);
    const warnings = [];
    const app = createHydrationRenderer(rendererOptions).createApp(client.Component);
    app.config.warnHandler = warning => warnings.push(warning);
    app.mount(root, true);
    await nextTick();
    assert.deepEqual(warnings, []);
    assert.equal(root.children[0], serverNode);
    assert.equal(text(root), "Ready");
    app.unmount();
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
