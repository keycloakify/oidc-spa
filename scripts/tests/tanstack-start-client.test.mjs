import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";
import { test } from "node:test";
import { build } from "esbuild";

const repo = fileURLToPath(new URL("../../", import.meta.url));
const { outputFiles } = await build({
    stdin: {
        contents: `
            export * from "./src/tanstack-start/react";
            export { setBASE_URL_earlyInit } from "./src/core/earlyInit_BASE_URL";
            export { setGetRootRelativeOriginalLocationHref_earlyInit } from "./src/core/earlyInit_rootRelativeOriginalLocationHref";
        `,
        resolveDir: repo
    },
    bundle: true,
    platform: "node",
    format: "cjs",
    write: false,
    plugins: [
        {
            name: "tanstack-start-client-fixture",
            setup(build) {
                const stubs = {
                    react: `
                    export const useState = init => globalThis.hooks.useState(init);
                    export const useReducer = (fn, init) => globalThis.hooks.useReducer(fn, init);
                    export const useEffect = (fn, deps) => globalThis.hooks.useEffect(fn, deps);
                    export const useLayoutEffect = useEffect;
                `,
                    "@tanstack/react-start": `
                    export const createServerFn = () => ({ handler: () => () => globalThis.fetchServerEnv() });
                    export const createMiddleware = () => ({
                        options: {},
                        client(fn) { this.options.client = fn; return this; },
                        server(fn) { this.options.server = fn; return this; }
                    });
                `,
                    "@tanstack/react-start/server": `
                    export const getRequest = () => { throw new Error("Unexpected server call"); };
                    export const setResponseHeader = () => {};
                    export const setResponseStatus = () => {};
                `,
                    "../../core":
                        "export const createOidc = params => globalThis.createCoreOidc(params);",
                    "virtual:oidc-spa/tanstack-start-public-env": `
                    export const publicEnvNames = new Set(globalThis.publicEnvNames);
                    export const toRedactEnvNames = new Set();
                `
                };
                build.onResolve({ filter: /.*/ }, ({ path, importer }) =>
                    Object.hasOwn(stubs, path) &&
                    (path !== "../../core" || importer.endsWith("/react/createUtils.ts"))
                        ? { path, namespace: "fixture" }
                        : undefined
                );
                build.onLoad({ filter: /.*/, namespace: "fixture" }, ({ path }) => ({
                    contents: stubs[path]
                }));
            }
        }
    ]
});

function deferred() {
    let resolve, reject;
    const promise = new Promise((yes, no) => {
        resolve = yes;
        reject = no;
    });
    return { promise, resolve, reject };
}
const tick = () => new Promise(resolve => setImmediate(resolve));
const configs = { mode: "real", issuerUri: "https://issuer.test", client: { clientId: "client" } };
const navigation = (cause = "enter") => ({ cause, location: { href: "/private?tab=profile#details" } });

// Exercise the real adapter and user/mock helpers. Replace only framework hooks,
// server-function transport and the OIDC transport; commit effects explicitly.
function fixture({ browser = true, loggedIn = true, envNames = [] } = {}) {
    const frames = new Map();
    const effects = [];
    let frame, cursor;
    const hooks = {
        useState(initial) {
            const slots = frame,
                index = cursor++;
            slots[index] ??= { value: typeof initial === "function" ? initial() : initial };
            return [
                slots[index].value,
                value => {
                    slots[index].value = value;
                }
            ];
        },
        useReducer(reducer, initial) {
            const slots = frame,
                index = cursor++;
            slots[index] ??= { value: initial };
            return [
                slots[index].value,
                action => {
                    slots[index].value = reducer(slots[index].value, action);
                }
            ];
        },
        useEffect(fn, deps) {
            const index = cursor++,
                previous = frame[index];
            if (
                browser &&
                (!previous || !deps || deps.some((value, i) => value !== previous.deps?.[i]))
            ) {
                frame[index] = { deps };
                effects.push(fn);
            }
        }
    };
    const record = { coreCalls: 0, envCalls: 0, login: [], tokens: [], reloads: 0 };
    const location = new URL("https://app.test/public");
    location.reload = () => record.reloads++;
    const history = { pushState() {}, replaceState() {} };
    const document = {};
    const module = { exports: {} };
    const control = { loggedIn, coreError: undefined, envError: undefined };
    const context = {
        module,
        console,
        URL,
        URLSearchParams,
        setTimeout,
        clearTimeout,
        history,
        hooks,
        process: { env: {} },
        publicEnvNames: envNames,
        fetchServerEnv: async () => {
            record.envCalls++;
            if (control.envError) throw control.envError;
            return {};
        },
        createCoreOidc: async params => {
            record.coreCalls++;
            const common = {
                issuerUri: params.issuerUri,
                clientId: params.clientId,
                validRedirectUri: "https://app.test/"
            };
            if (!control.loggedIn || control.coreError) {
                return {
                    ...common,
                    isUserLoggedIn: false,
                    initializationError: control.coreError,
                    login: async options => {
                        record.login.push(options);
                        return new Promise(() => {});
                    }
                };
            }
            const listeners = new Set();
            return {
                ...common,
                isUserLoggedIn: true,
                getTokens: async options => {
                    record.tokens.push(options);
                    return { accessToken: "access-token" };
                },
                getAccessToken: async () => "access-token",
                subscribeToAutoLogoutState: () => ({ unsubscribeFromAutoLogoutState() {} }),
                subscribeToUserChange: next => {
                    listeners.add(next);
                    return { unsubscribeFromUserChange: () => listeners.delete(next) };
                },
                getUser: async () => {
                    let user;
                    try {
                        user = await params.createUser({
                            ...common,
                            idTokenClaims: { sub: "user" },
                            accessToken: "access-token",
                            user_current: undefined
                        });
                    } catch (error) {
                        throw new module.exports.OidcInitializationError({
                            isAuthServerLikelyDown: false,
                            messageOrCause: error
                        });
                    }
                    listeners.forEach(next => next({ user, user_previous: undefined }));
                    return user;
                }
            };
        }
    };
    if (browser)
        Object.assign(context, {
            window: { location, document, history, setTimeout, clearTimeout },
            document,
            navigator: {}
        });
    runInNewContext(outputFiles[0].text, context);
    module.exports.setBASE_URL_earlyInit({ BASE_URL: "/" });
    module.exports.setGetRootRelativeOriginalLocationHref_earlyInit({
        rootRelativeOriginalLocationHref: "/public"
    });
    return {
        ...module.exports,
        record,
        control,
        history,
        createUtils(createClientUser = () => ({ displayName: "Alice" }), runtimeConfigs = configs) {
            return module.exports.oidcSpa
                .withClientUser(createClientUser)
                .withRuntimeConfigs(runtimeConfigs)
                .createUtils();
        },
        render(component, props) {
            if (!frames.has(component)) frames.set(component, []);
            frame = frames.get(component);
            cursor = 0;
            return component(props);
        },
        commit() {
            effects.splice(0).forEach(effect => effect());
        }
    };
}

for (const asynchronous of [false, true]) {
    test(`configuration errors reach navigation boundaries, async=${asynchronous}`, async () => {
        const f = fixture();
        const cause = new Error("Configuration unavailable");
        const getter = () => {
            throw cause;
        };
        const utils = f.createUtils(undefined, asynchronous ? async () => getter() : getter);
        const oidc = await utils.getOidc();
        const error = oidc.initializationError;
        assert(error instanceof f.OidcInitializationError);
        assert.equal(error.cause.cause, cause);
        assert.equal(oidc.isUserLoggedIn, false);
        assert.equal(await utils.getOidc(), oidc);
        await assert.rejects(utils.getOidc({ assert: "user logged in" }), e => e === error);
        await assert.rejects(
            utils.enforceLogin(navigation("preload")),
            e => e !== error && /not yet logged in/.test(e.message)
        );
        await assert.rejects(utils.enforceLogin(navigation()), e => e === error);
        assert.equal(f.record.login.length, 0);
        assert.equal(f.record.coreCalls, 0);
        assert.equal(f.render(utils.useOidc).initializationError, undefined);
        f.commit();
        assert.equal(f.render(utils.useOidc).initializationError, error);
        assert.throws(
            () => f.render(utils.useOidc, { assert: "user logged in" }),
            e => e === error
        );
    });
}

test("failure to retrieve server environment settles client initialization", async () => {
    const f = fixture({ envNames: ["ISSUER"] });
    const cause = new Error("Server function unavailable");
    f.control.envError = cause;
    let getterCalls = 0;
    const utils = f.createUtils(undefined, () => {
        getterCalls++;
        return configs;
    });
    const error = (await utils.getOidc()).initializationError;
    assert(error instanceof f.OidcInitializationError);
    assert.equal(error.cause.cause, cause);
    await assert.rejects(utils.enforceLogin(navigation()), e => e === error);
    assert.equal(getterCalls, 0);
    assert.equal(f.record.envCalls, 1);
});

test("authorization errors are surfaced without starting another login", async () => {
    const f = fixture();
    const error = new f.OidcInitializationError({
        authResponse: { error: "access_denied", error_description: "Consent refused" }
    });
    f.control.coreError = error;
    const utils = f.createUtils();
    await assert.rejects(utils.enforceLogin(navigation()), e => e === error);
    assert.equal((await utils.getOidc()).initializationError, error);
    assert.equal(f.record.login.length, 0);
});

test("logged-out preloads do not start login; navigation preserves its destination", async () => {
    const f = fixture({ loggedIn: false });
    const utils = f.createUtils();
    await assert.rejects(utils.enforceLogin(navigation("preload")), /not yet logged in/);
    assert.equal(f.record.login.length, 0);
    void utils.enforceLogin(navigation());
    await tick();
    assert.equal(f.record.login.length, 1);
    assert.equal(f.record.login[0].returnToUrl, "https://app.test/private?tab=profile#details");
    assert.equal(f.record.login[0].doesCurrentHrefEnforceLogin, false);
});

test("page protection waits for user construction and preserves imperative token access", async () => {
    const f = fixture();
    const user = deferred();
    const utils = f.createUtils(async () => {
        const oidc = await utils.getOidc({ assert: "user logged in" });
        assert.equal(await oidc.getAccessToken(), "access-token");
        return user.promise;
    });
    let activated = false;
    const guard = utils.enforceLogin(navigation()).then(() => {
        activated = true;
    });
    const oidc = await utils.getOidc({ assert: "user logged in" });
    await tick();
    assert.equal(activated, false);
    await oidc.getTokens({ scopes: ["email"] });
    assert.equal(f.record.tokens.at(-1).returnToUrl, "https://app.test/private?tab=profile#details");
    user.resolve({ displayName: "Alice" });
    await guard;
    assert.equal(activated, true);
    assert.equal(f.render(utils.useOidc).isOidcReady, false);
    f.commit();
    const state = f.render(utils.useOidc);
    assert.equal(state.isOidcReady, true);
    assert.equal(state.user.displayName, "Alice");
    f.history.pushState();
    await oidc.getTokens({ scopes: ["email"] });
    assert.equal(f.record.tokens.at(-1).returnToUrl, undefined);
});

test("user-construction errors reach page protection while tokens remain usable", async () => {
    const f = fixture();
    const utils = f.createUtils(() => {
        throw new Error("Profile unavailable");
    });
    const oidc = await utils.getOidc({ assert: "user logged in" });
    await tick();
    assert.equal(f.render(utils.useOidc).isOidcReady, false);
    f.commit();
    const state = f.render(utils.useOidc);
    assert.equal(state.isOidcReady, true);
    assert.equal(state.isUserLoggedIn, false);
    const error = state.initializationError;
    assert(error instanceof f.OidcInitializationError);
    assert.throws(
        () => f.render(utils.useOidc, { assert: "user logged in" }),
        e => e === error
    );
    await assert.rejects(utils.enforceLogin(navigation()), e => e === error);
    assert.equal(await oidc.getAccessToken(), "access-token");
    assert.equal(f.record.login.length, 0);
    assert.equal(f.record.reloads, 0);
});

test("SSR keeps authentication pending and protected routes retain their client-only marker", async () => {
    const f = fixture({ browser: false });
    const utils = f.createUtils();
    assert.equal(f.render(utils.useOidc).isOidcReady, false);
    f.commit();
    await tick();
    assert.equal(f.record.coreCalls, 0);
    assert.equal(f.record.envCalls, 0);
    await assert.rejects(utils.getOidc(), /can't be used on the server/);
    await assert.rejects(utils.enforceLogin(navigation()), /cannot be used on the server/);
    assert.equal(f.__disableSsrIfLoginEnforced({ beforeLoad: utils.enforceLogin }).ssr, false);
});

test("mock mode uses the unified API without automatic login", async () => {
    const f = fixture();
    let isMock;
    const utils = f.createUtils(
        params => {
            isMock = params.isMock;
            return { displayName: "Mock user" };
        },
        { mode: "mock" }
    );
    assert.equal("withAutoLogin" in f.oidcSpa, false);
    assert.equal(typeof utils.enforceLogin, "function");
    await utils.enforceLogin(navigation());
    assert.equal(isMock, true);
    assert.equal(f.record.coreCalls, 0);
});
