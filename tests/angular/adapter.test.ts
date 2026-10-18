import "@angular/compiler";
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
    ApplicationInitStatus,
    computed,
    createEnvironmentInjector,
    EnvironmentInjector,
    ErrorHandler,
    inject,
    InjectionToken,
    Injector,
    PLATFORM_ID,
    runInInjectionContext,
    ɵINJECTOR_SCOPE,
    ɵChangeDetectionScheduler,
    type EnvironmentProviders,
    type Provider
} from "@angular/core";
import { DOCUMENT } from "@angular/common";
import {
    HttpClient,
    HttpContext,
    HttpContextToken,
    provideHttpClient,
    withInterceptors,
    type HttpRequest
} from "@angular/common/http";
import { HttpTestingController, provideHttpClientTesting } from "@angular/common/http/testing";
import {
    NavigationCancel,
    NavigationCancellationCode,
    NavigationEnd,
    NavigationError,
    NavigationSkipped,
    Router,
    type ActivatedRouteSnapshot,
    type RouterStateSnapshot
} from "@angular/router";
import { firstValueFrom, Subject } from "rxjs";
import { oidcSpa, type Oidc_angular } from "../../src/angular";
import { OidcInitializationError } from "../../src/core/OidcInitializationError";
import { setBASE_URL_earlyInit } from "../../src/core/earlyInit_BASE_URL";
import { setGetRootRelativeOriginalLocationHref_earlyInit } from "../../src/core/earlyInit_rootRelativeOriginalLocationHref";
import { resetCore } from "./core";

const location = new URL("https://app.test/");
let reloads = 0;
let alerts = 0;
Object.assign(location, { reload: () => reloads++ });
const history = { pushState() {}, replaceState() {} };
const document = { querySelector: () => ({ getAttribute: () => "/" }), cookie: "" };
Object.assign(globalThis, {
    window: { location, history, document, setTimeout, clearTimeout, alert: () => alerts++ },
    location,
    history,
    document
});
setBASE_URL_earlyInit({ BASE_URL: "/" });
setGetRootRelativeOriginalLocationHref_earlyInit({ rootRelativeOriginalLocationHref: "/" });
const OPTIONAL = new HttpContextToken(() => false);
const REQUIRED = new HttpContextToken(() => false);
const INJECTED_NAME = new InjectionToken<string>("name");
const API = new InjectionToken("UserApi", {
    factory: () => {
        const http = inject(HttpClient);
        return {
            getUser: () =>
                http.get<{ displayName: string }>("/api/user", {
                    context: new HttpContext().set(OPTIONAL, true)
                })
        };
    }
});
const params = { mode: "real" as const, issuerUri: "https://issuer.test", clientId: "client" };
const injectors: EnvironmentInjector[] = [];
function app(providers: (Provider | EnvironmentProviders)[]) {
    const injector = createEnvironmentInjector(
        [
            { provide: ɵINJECTOR_SCOPE, useValue: "root" },
            { provide: ɵChangeDetectionScheduler, useValue: { notify() {} } },
            { provide: PLATFORM_ID, useValue: "browser" },
            { provide: DOCUMENT, useValue: document },
            { provide: INJECTED_NAME, useValue: "injected" },
            ...providers
        ],
        Injector.NULL as EnvironmentInjector
    );
    injectors.push(injector);
    const initialization = injector.get(ApplicationInitStatus);
    (initialization as ApplicationInitStatus & { runInitializers(): void }).runInitializers();
    return { injector, initialization };
}
const tick = () => new Promise<void>(resolve => setImmediate(resolve));
const anonymousFactory = () => undefined;
const causeOf = (error: Error): unknown => (error as Error & { cause: unknown }).cause;
const mockClaims = (name: string) => ({
    iss: "https://issuer.test",
    sub: "mock-user",
    aud: "client",
    exp: 9999999999,
    iat: 1,
    name
});
const route = {} as ActivatedRouteSnapshot;
const routerState = (url: string) => ({ url } as RouterStateSnapshot);
afterEach(() => {
    injectors.splice(0).forEach(injector => {
        if (!injector.destroyed) injector.destroy();
    });
});
function predicate(oidc: Oidc_angular<unknown>, req: HttpRequest<unknown>) {
    if (req.context.get(REQUIRED)) return true;
    if (req.context.get(OPTIONAL)) return oidc.isUserLoggedIn;
    return false;
}

for (const autoLogin of [false, true]) {
    for (const nonBlocking of [false, true]) {
        test(
            `injectable user lifecycle with authenticated HttpClient, nonBlocking=${nonBlocking}, autoLogin=${autoLogin}`,
            { timeout: 3000 },
            async t => {
                const core = resetCore();
                let builds = 0;
                const previousUsers: unknown[] = [];
                const base = oidcSpa.withUser<{ displayName: string }>(
                    async ({ isMock, idTokenClaims, user_current }) => {
                        assert.equal(isMock, false);
                        assert.equal(typeof idTokenClaims.name, "string");
                        const api = inject(API);
                        const suffix = inject(INJECTED_NAME);
                        builds++;
                        previousUsers.push(user_current);
                        const user = await firstValueFrom(api.getUser());
                        return { displayName: `${user.displayName} ${suffix}` };
                    }
                );
                const builder = nonBlocking ? base.withNonBlockingRendering() : base;
                const utils = (autoLogin ? builder.withAutoLogin() : builder).createUtils();
                const { injector, initialization } = app([
                    provideHttpClient(
                        withInterceptors([
                            utils.createOidcInterceptor({
                                shouldInjectAccessToken: req => predicate(utils.injectOidc(), req)
                            })
                        ])
                    ),
                    provideHttpClientTesting(),
                    utils.provideOidc(() =>
                        firstValueFrom(inject(HttpClient).get<typeof params>("/oidc-config.json"))
                    )
                ]);
                const http = injector.get(HttpTestingController);
                const oidc = runInInjectionContext(injector, () => utils.injectOidc());
                assert.throws(() => oidc.user!(), /before oidc.prInitialized resolved/);
                assert.throws(() => oidc.isUserLoggedIn, /before core authentication is ready/);
                const config = http.expectOne("/oidc-config.json");
                assert.equal(config.request.headers.has("Authorization"), false);
                config.flush({ ...params, warnUserSecondsBeforeAutoLogout: 12 });
                await tick();
                assert.equal(initialization.done, nonBlocking);
                core.ready.resolve();
                await tick();
                assert.equal(oidc.isUserLoggedIn, true);
                assert.equal(initialization.done, nonBlocking);
                assert.equal(core.params?.warnUserSecondsBeforeAutoLogout, 12);
                const request = http.expectOne("/api/user");
                assert.equal(request.request.headers.get("Authorization"), "Bearer access-token-2");
                request.flush({ displayName: "Alice" });
                await oidc.prInitialized;
                await initialization.donePromise;
                const imperative = await utils.getOidc({ assert: "user logged in" });
                assert.equal(await imperative.getUser(), oidc.user!());
                const seen: string[] = [];
                imperative.subscribeToUserChange(({ user }) => seen.push(user.displayName));
                const rotations: string[] = [];
                imperative.subscribeToTokensChange(({ accessToken }) => rotations.push(accessToken));
                core.rotate();
                await tick();
                assert.equal(builds, 1);
                http.expectNone("/api/user");
                assert.equal(rotations.length, 1);
                core.rotate("Alicia");
                await tick();
                http.expectOne("/api/user").flush({ displayName: "Alicia" });
                await tick();
                assert.equal(oidc.user!().displayName, "Alicia injected");
                const refreshed = oidc.refreshUser!();
                await tick();
                http.expectOne("/api/user").flush({ displayName: "Bob" });
                assert.equal(await refreshed, undefined);
                assert.equal(oidc.user!().displayName, "Bob injected");
                assert.deepEqual(previousUsers, [
                    undefined,
                    { displayName: "Alice injected" },
                    { displayName: "Alicia injected" }
                ]);
                assert.deepEqual(seen, ["Alicia injected", "Bob injected"]);
                const log = t.mock.method(console, "error", () => {});
                const failed = oidc.refreshUser!();
                await tick();
                http.expectOne("/api/user").flush("unavailable", {
                    status: 503,
                    statusText: "Unavailable"
                });
                await assert.rejects(failed);
                assert.equal(oidc.user!().displayName, "Bob injected");
                assert.equal(log.mock.calls.length, 1);
                const warning = {
                    shouldDisplayWarning: true as const,
                    secondsLeftBeforeAutoLogout: 0,
                    resetAutoLogoutCountdown() {}
                };
                core.emitAutoLogout(warning);
                assert.equal(oidc.autoLogoutState(), warning);
                core.emitAutoLogout({ shouldDisplayWarning: false });
                assert.deepEqual(oidc.autoLogoutState(), { shouldDisplayWarning: false });
                http.verify();
                injector.destroy();
                assert.equal(core.tokenListeners.size, 0);
                assert.equal(core.autoLogoutListeners.size, 0);
                assert.equal(core.userSubscriptions, 0);
            }
        );
    }
}

test("optional requests retry their predicate in the injection context when core is ready", async () => {
    const core = resetCore();
    core.loggedIn = false;
    let evaluations = 0;
    const predicateError = new Error("broken predicate");
    const utils = oidcSpa.withUser(anonymousFactory).withNonBlockingRendering().createUtils();
    const { injector } = app([
        utils.provideOidc(params),
        provideHttpClient(
            withInterceptors([
                utils.createOidcInterceptor({
                    shouldInjectAccessToken: req => {
                        if (req.url === "/broken") throw predicateError;
                        evaluations++;
                        return predicate(utils.injectOidc(), req);
                    }
                })
            ])
        ),
        provideHttpClientTesting()
    ]);
    const http = injector.get(HttpClient);
    const testing = injector.get(HttpTestingController);
    await assert.rejects(firstValueFrom(http.get("/broken")), error => error === predicateError);
    const response = firstValueFrom(
        http.get("/optional", { context: new HttpContext().set(OPTIONAL, true) })
    );
    testing.expectNone("/optional");
    assert.equal(evaluations, 1);
    core.ready.resolve();
    await tick();
    assert.equal(evaluations, 2);
    const request = testing.expectOne("/optional");
    assert.equal(request.request.headers.has("Authorization"), false);
    request.flush("public");
    await response;
    await assert.rejects(
        firstValueFrom(http.get("/required", { context: new HttpContext().set(REQUIRED, true) })),
        /not logged in/
    );
    const oidc = runInInjectionContext(injector, () => utils.injectOidc());
    assert.throws(() => oidc.user!(), /not logged in/);
    testing.verify();
});

for (const autoLogin of [false, true]) {
    for (const isAsync of [false, true]) {
        test(`runtime config errors settle initialization, autoLogin=${autoLogin}, async=${isAsync}`, async () => {
            const core = resetCore();
            const cause = new Error("config failed");
            const base = oidcSpa.withUser(anonymousFactory);
            const utils = (autoLogin ? base.withAutoLogin() : base).createUtils();
            const getter = () => {
                throw cause;
            };
            const { injector, initialization } = app([
                utils.provideOidc(isAsync ? async () => getter() : getter)
            ]);
            await initialization.donePromise;
            const oidc = runInInjectionContext(injector, () => utils.injectOidc());
            const error =
                "injectOidcInitializationError" in utils
                    ? runInInjectionContext(injector, utils.injectOidcInitializationError)()
                    : "initializationError" in oidc
                    ? oidc.initializationError
                    : undefined;
            assert.ok(error instanceof OidcInitializationError);
            assert.equal(error.isAuthServerLikelyDown, false);
            assert.equal(causeOf(causeOf(error) as Error), cause);
            assert.equal(core.calls, 0);
            if (!autoLogin) {
                assert.equal(oidc.isUserLoggedIn, false);
                const before = alerts;
                void oidc.login!({});
                await tick();
                assert.equal(alerts, before + 1);
            }
        });
    }
}

test("unexpected core and subscription errors propagate unchanged", async () => {
    for (const duringSubscription of [false, true]) {
        const core = resetCore();
        const cause = new Error("unexpected bug");
        if (duringSubscription) {
            const createOidc = core.createOidc;
            core.createOidc = async params => {
                const oidc = await createOidc(params);
                assert.ok(oidc.isUserLoggedIn);
                oidc.subscribeToAutoLogoutState = () => {
                    throw cause;
                };
                return oidc;
            };
        } else core.error = cause;
        const utils = oidcSpa.withUser(anonymousFactory).createUtils();
        const { initialization } = app([utils.provideOidc(params)]);
        core.ready.resolve();
        await assert.rejects(initialization.donePromise, error => error === cause);
    }
});

for (const autoLogin of [false, true]) {
    test(`core initialization failures use the UI error path, autoLogin=${autoLogin}`, async () => {
        const core = resetCore();
        core.error = new OidcInitializationError({
            messageOrCause: "issuer unavailable",
            isAuthServerLikelyDown: true
        });
        const base = oidcSpa.withUser(anonymousFactory);
        const utils = (autoLogin ? base.withAutoLogin() : base).createUtils();
        const { injector, initialization } = app([utils.provideOidc(params)]);
        core.ready.resolve();
        await initialization.donePromise;
        const oidc = runInInjectionContext(injector, () => utils.injectOidc());
        if ("injectOidcInitializationError" in utils) {
            assert.equal(
                runInInjectionContext(injector, utils.injectOidcInitializationError)(),
                core.error
            );
            assert.throws(() => oidc.isUserLoggedIn, /injectOidcInitializationError/);
            let settled = false;
            void utils.getOidc().then(() => {
                settled = true;
            });
            await tick();
            assert.equal(settled, false);
        } else {
            assert.equal(oidc.isUserLoggedIn, false);
            assert.equal(oidc.initializationError, core.error);
            assert.equal((await utils.getOidc()).initializationError, core.error);
        }
    });

    test(`initial user failure preserves imperative tokens, autoLogin=${autoLogin}`, async () => {
        const core = resetCore();
        const cause = new Error("profile unavailable");
        const base = oidcSpa.withUser(async () => {
            throw cause;
        });
        const utils = (autoLogin ? base.withAutoLogin() : base).createUtils();
        const { injector, initialization } = app([
            utils.provideOidc(params),
            { provide: Router, useValue: { events: new Subject(), getCurrentNavigation: () => null } }
        ]);
        const oidc = runInInjectionContext(injector, () => utils.injectOidc());
        core.ready.resolve();
        await initialization.donePromise;
        const error =
            "injectOidcInitializationError" in utils
                ? runInInjectionContext(injector, utils.injectOidcInitializationError)()
                : "initializationError" in oidc
                ? oidc.initializationError
                : undefined;
        assert.ok(error instanceof OidcInitializationError);
        assert.equal(error.isAuthServerLikelyDown, false);
        assert.throws(() => oidc.user!(), error);
        const imperative = await utils.getOidc({ assert: "user logged in" });
        assert.match(await imperative.getAccessToken(), /^access-token-/);
        if ("enforceLoginGuard" in utils) {
            assert.equal(oidc.isUserLoggedIn, false);
            await assert.rejects(
                runInInjectionContext(injector, () =>
                    utils.enforceLoginGuard(route, routerState("/protected"))
                ),
                error
            );
            const before = reloads;
            void oidc.login!({});
            await tick();
            assert.equal(reloads, before + 1);
        }
    });
}

for (const nonBlocking of [false, true]) {
    test(`mock user factory and runtime token overrides, nonBlocking=${nonBlocking}`, async () => {
        const core = resetCore();
        const calls: unknown[] = [];
        const base = oidcSpa.withUser<{ name: unknown; suffix: string }>(
            ({ isMock, idTokenClaims, accessToken, user_current }) => {
                calls.push({ isMock, idTokenClaims, accessToken, user_current });
                return { name: idTokenClaims.name, suffix: inject(INJECTED_NAME) };
            }
        );
        const builder = nonBlocking ? base.withNonBlockingRendering() : base;
        const first = builder.createUtils();
        const second = builder.createUtils();
        const a = app([first.provideOidc({ mode: "mock", idTokenClaims_mock: mockClaims("Alice") })]);
        const b = app([
            second.provideOidc({
                mode: "mock",
                idTokenClaims_mock: mockClaims("Bob"),
                accessToken_mock: "custom",
                refreshToken_mock: "refresh",
                idToken_mock: "id",
                issuerUri_mock: "https://other.test",
                clientId_mock: "other"
            })
        ]);
        const oidcA = runInInjectionContext(a.injector, () => first.injectOidc());
        const oidcB = runInInjectionContext(b.injector, () => second.injectOidc());
        await Promise.all([oidcA.prInitialized, oidcB.prInitialized]);
        assert.notEqual(oidcA, oidcB);
        assert.deepEqual(oidcA.user!(), { name: "Alice", suffix: "injected" });
        assert.deepEqual(oidcB.user!(), { name: "Bob", suffix: "injected" });
        const imperative = await second.getOidc({ assert: "user logged in" });
        const tokens = await imperative.getTokens();
        assert.equal(tokens.accessToken, "custom");
        assert.equal(tokens.idToken, "id");
        assert.equal(tokens.refreshToken, "refresh");
        assert.equal(imperative.clientId, "other");
        assert.equal(imperative.issuerUri, "https://other.test");
        await oidcB.refreshUser!();
        assert.equal(calls.length, 3);
        assert.equal(core.calls, 0);
    });
}

test("builder branches are independent and auto-login reaches core", async () => {
    const core = resetCore();
    const base = oidcSpa.withUser(() => "Alice");
    const utils = base.withAutoLogin().createUtils();
    assert.equal("enforceLoginGuard" in utils, false);
    const first = app([utils.provideOidc(params)]);
    core.ready.resolve();
    await first.initialization.donePromise;
    assert.equal(core.params?.autoLogin, true);
    assert.equal(
        runInInjectionContext(first.injector, utils.injectOidcInitializationError)(),
        undefined
    );
    const other = base.createUtils();
    assert.equal("injectOidcInitializationError" in other, false);
    const second = app([other.provideOidc({ mode: "mock", isUserInitiallyLoggedIn: false })]);
    await second.initialization.donePromise;
    assert.equal(runInInjectionContext(second.injector, () => other.injectOidc()).isUserLoggedIn, false);
});

test("guard waits for user and supplies the target URL to parameterized token requests", async () => {
    const core = resetCore();
    let resolveUser!: (user: string) => void;
    const utils = oidcSpa
        .withUser(
            () =>
                new Promise<string>(resolve => {
                    resolveUser = resolve;
                })
        )
        .withNonBlockingRendering()
        .createUtils();
    const events = new Subject();
    const { injector } = app([
        utils.provideOidc(params),
        { provide: Router, useValue: { events, getCurrentNavigation: () => null } }
    ]);
    let allowed = false;
    const target = "/nested/protected?tab=profile#details";
    const guard = runInInjectionContext(injector, () =>
        utils.enforceLoginGuard(route, routerState(target))
    );
    void guard.then(() => {
        allowed = true;
    });
    core.ready.resolve();
    await tick();
    assert.equal(allowed, false);
    const imperative = await utils.getOidc({ assert: "user logged in" });
    const expected = "https://app.test/base" + target;
    await imperative.getTokens({ scopes: ["email"] });
    assert.deepEqual(core.tokenRequests.slice(-1)[0], { scopes: ["email"], returnToUrl: expected });
    await imperative.getAccessToken({ authorizationParams: { audience: "api" } });
    assert.equal(core.tokenRequests.slice(-1)[0]?.returnToUrl, expected);
    await imperative.getTokens({ returnToUrl: "/explicit" });
    assert.equal(core.tokenRequests.slice(-1)[0]?.returnToUrl, "/explicit");
    await imperative.getTokens();
    assert.equal(core.tokenRequests.slice(-1)[0], undefined);
    resolveUser("Alice");
    assert.equal(await guard, true);
    events.next(new NavigationEnd(1, target, target));
    await imperative.getTokens({ scopes: ["email"] });
    assert.equal(core.tokenRequests.slice(-1)[0]?.returnToUrl, undefined);
});

for (const event of [
    new NavigationCancel(1, "/protected", "cancelled", NavigationCancellationCode.GuardRejected),
    new NavigationError(1, "/protected", new Error("navigation failed")),
    new NavigationSkipped(1, "/protected", "skipped")
]) {
    test(`navigation ${event.constructor.name} clears the token return URL`, async () => {
        const core = resetCore();
        const utils = oidcSpa.withUser(() => "Alice").createUtils();
        const events = new Subject();
        const { injector, initialization } = app([
            utils.provideOidc(params),
            { provide: Router, useValue: { events, getCurrentNavigation: () => null } }
        ]);
        core.ready.resolve();
        await initialization.donePromise;
        await runInInjectionContext(injector, () =>
            utils.enforceLoginGuard(route, routerState("/protected"))
        );
        events.next(event);
        const imperative = await utils.getOidc({ assert: "user logged in" });
        await imperative.getAccessToken({ scopes: ["email"] });
        assert.equal(core.tokenRequests.slice(-1)[0]?.returnToUrl, undefined);
    });
}

test("anonymous guard preserves query and fragment in the requested route", async () => {
    const core = resetCore();
    core.loggedIn = false;
    const utils = oidcSpa.withUser(anonymousFactory).createUtils();
    const { injector } = app([
        utils.provideOidc(params),
        { provide: Router, useValue: { getCurrentNavigation: () => null } }
    ]);
    core.ready.resolve();
    void runInInjectionContext(injector, () =>
        utils.enforceLoginGuard(route, routerState("/protected?tab=2#section"))
    );
    await tick();
    assert.deepEqual(core.loginParams, {
        returnToUrl: "https://app.test/base/protected?tab=2#section",
        doesCurrentHrefEnforceLogin: false
    });
});

for (const loggedIn of [false, true]) {
    test(`assertions and stable imperative object, loggedIn=${loggedIn}`, async () => {
        const core = resetCore();
        core.loggedIn = loggedIn;
        const utils = oidcSpa.withUser(() => "Alice").createUtils();
        const { injector, initialization } = app([utils.provideOidc(params)]);
        assert.throws(
            () => runInInjectionContext(injector, () => utils.injectOidc({ assert: "user logged in" })),
            /before core authentication is ready/
        );
        core.ready.resolve();
        await initialization.donePromise;
        const first = await utils.getOidc();
        assert.equal(first, await utils.getOidc());
        const correct = loggedIn ? "user logged in" : "user not logged in";
        const wrong = loggedIn ? "user not logged in" : "user logged in";
        assert.equal(await utils.getOidc({ assert: correct as "user logged in" }), first);
        await assert.rejects(utils.getOidc({ assert: wrong as "user logged in" }), /Called getOidc/);
        assert.throws(
            () =>
                runInInjectionContext(injector, () =>
                    utils.injectOidc({ assert: wrong as "user logged in" })
                ),
            /Called injectOidc/
        );
        assert.throws(() => utils.injectOidc(), /injection context/);
        const oidc = runInInjectionContext(injector, () => utils.injectOidc());
        if (loggedIn) {
            assert.equal(oidc.user!(), "Alice");
            assert.deepEqual(oidc.authorizationResult, {
                authorizationParams: { kc_action: "UPDATE_PASSWORD" },
                response: { kc_action_status: "success" }
            });
            void oidc.startAuthorization!({
                returnToUrl: "/profile",
                authorizationParams: { kc_action: "UPDATE_PASSWORD" }
            });
            await tick();
            assert.deepEqual(core.authorizationParams, {
                returnToUrl: "/profile",
                authorizationParams: { kc_action: "UPDATE_PASSWORD" }
            });
            void oidc.logout!({ returnToUrl: "/" });
            await tick();
            assert.deepEqual(core.logoutParams, { returnToUrl: "/" });
            assert.equal("getAccessToken" in oidc, false);
        } else {
            void oidc.login!({});
            await tick();
            assert.deepEqual(core.loginParams, { doesCurrentHrefEnforceLogin: false });
            void oidc.login!({ doesCurrentHrefEnforceLogin: true, returnToUrl: "/protected" });
            await tick();
            assert.deepEqual(core.loginParams, {
                doesCurrentHrefEnforceLogin: true,
                returnToUrl: "/protected"
            });
        }
    });
}

test("getOidc can wait before the provider and acquire tokens inside createUser", async () => {
    const core = resetCore();
    const utils = oidcSpa
        .withUser<string>(async (): Promise<string> => {
            const oidc = await utils.getOidc({ assert: "user logged in" });
            return `User with ${await oidc.getAccessToken()}`;
        })
        .createUtils();
    const pending = utils.getOidc({ assert: "user logged in" });
    let settled = false;
    void pending.then(() => {
        settled = true;
    });
    await tick();
    assert.equal(settled, false);
    const { injector, initialization } = app([utils.provideOidc(params)]);
    core.ready.resolve();
    assert.match(await (await pending).getAccessToken(), /^access-token-/);
    await initialization.donePromise;
    assert.match(
        runInInjectionContext(injector, () => utils.injectOidc()).user!(),
        /^User with access-token-/
    );
});

test("tokens remain available while the user is pending; destroying the app detaches subscriptions", async () => {
    const core = resetCore();
    let resolveUser!: (user: string) => void;
    const utils = oidcSpa
        .withUser(
            () =>
                new Promise<string>(resolve => {
                    resolveUser = resolve;
                })
        )
        .withNonBlockingRendering()
        .createUtils();
    const { injector } = app([utils.provideOidc(params)]);
    const oidc = runInInjectionContext(injector, () => utils.injectOidc());
    core.ready.resolve();
    const imperative = await utils.getOidc({ assert: "user logged in" });
    assert.match(await imperative.getAccessToken(), /^access-token-/);
    assert.throws(() => oidc.user!(), /before oidc.prInitialized resolved/);
    imperative.subscribeToTokensChange(() => {});
    imperative.subscribeToUserChange(() => {});
    imperative.subscribeToAutoLogoutState(() => {});
    injector.destroy();
    resolveUser("Alice");
    await oidc.prInitialized;
    assert.equal(core.userSubscriptions, 0);
    assert.equal(core.tokenListeners.size, 0);
    assert.equal(core.autoLogoutListeners.size, 0);
});

test("user-dependent interceptors report the initialization cycle", async () => {
    const core = resetCore();
    const utils = oidcSpa.withUser(() => firstValueFrom(inject(API).getUser())).createUtils();
    const { injector, initialization } = app([
        utils.provideOidc(params),
        provideHttpClient(
            withInterceptors([
                utils.createOidcInterceptor({
                    shouldInjectAccessToken: () => utils.injectOidc().user!().displayName !== ""
                })
            ])
        ),
        provideHttpClientTesting()
    ]);
    core.ready.resolve();
    await initialization.donePromise;
    const error = runInInjectionContext(injector, () => utils.injectOidc()).initializationError;
    assert.ok(error instanceof OidcInitializationError);
    assert.match(String(causeOf(error)), /Requests made by createUser/);
    injector.get(HttpTestingController).expectNone("/api/user");
});

test("one active browser app per utils, with fresh state after destruction", async () => {
    const utils = oidcSpa.withUser(({ idTokenClaims }) => idTokenClaims.name).createUtils();
    const first = app([utils.provideOidc({ mode: "mock", idTokenClaims_mock: mockClaims("first") })]);
    await first.initialization.donePromise;
    const firstOidc = await utils.getOidc({ assert: "user logged in" });
    assert.throws(() => app([utils.provideOidc({ mode: "mock" })]), /one active application injector/);
    first.injector.destroy();
    const pending = utils.getOidc({ assert: "user logged in" });
    const second = app([utils.provideOidc({ mode: "mock", idTokenClaims_mock: mockClaims("second") })]);
    await second.initialization.donePromise;
    const secondOidc = await pending;
    assert.notEqual(firstOidc, secondOidc);
    assert.equal(await secondOidc.getUser(), "second");
});

for (const nonBlocking of [false, true]) {
    for (const autoLogin of [false, true]) {
        test(`SSR leaves auth pending, nonBlocking=${nonBlocking}, autoLogin=${autoLogin}`, async () => {
            const core = resetCore();
            let userCalls = 0;
            let configCalls = 0;
            const base = oidcSpa.withUser(() => {
                userCalls++;
                return "Alice";
            });
            const builder = nonBlocking ? base.withNonBlockingRendering() : base;
            const utils = (autoLogin ? builder.withAutoLogin() : builder).createUtils();
            const { injector, initialization } = app([
                utils.provideOidc(() => {
                    configCalls++;
                    return params;
                }),
                { provide: PLATFORM_ID, useValue: "server" }
            ]);
            await initialization.donePromise;
            const oidc = runInInjectionContext(injector, () => utils.injectOidc());
            assert.equal(
                runInInjectionContext(injector, () => utils.injectOidc()),
                oidc
            );
            let ready = false;
            void oidc.prInitialized.then(() => {
                ready = true;
            });
            await tick();
            assert.equal(ready, false);
            assert.equal(configCalls, 0);
            assert.equal(core.calls, 0);
            assert.equal(userCalls, 0);
            assert.throws(() => oidc.isUserLoggedIn, /before core authentication is ready/);
            assert.throws(() => oidc.user!(), /before oidc.prInitialized resolved/);
            if ("enforceLoginGuard" in utils) {
                await assert.rejects(
                    runInInjectionContext(injector, () => utils.enforceLoginGuard(route)),
                    /enforceLoginGuard.*RenderMode.Client.*app.routes.server.ts/
                );
            }
        });
    }
}

test("SSR runtimes do not capture or release the active browser app", async () => {
    const utils = oidcSpa
        .withUser(() => "Alice")
        .withNonBlockingRendering()
        .createUtils();
    const browser = app([utils.provideOidc({ mode: "mock" })]);
    const imperative = await utils.getOidc({ assert: "user logged in" });
    const serverApps = [0, 1].map(() =>
        app([utils.provideOidc({ mode: "mock" }), { provide: PLATFORM_ID, useValue: "server" }])
    );
    const serverOidcs = serverApps.map(({ injector }) =>
        runInInjectionContext(injector, () => utils.injectOidc())
    );
    assert.notEqual(serverOidcs[0], serverOidcs[1]);
    assert.notEqual(serverOidcs[0].prInitialized, serverOidcs[1].prInitialized);
    serverApps.forEach(({ injector }) => injector.destroy());
    assert.equal(await utils.getOidc(), imperative);
    await runInInjectionContext(browser.injector, () => utils.injectOidc()).prInitialized;
    assert.equal(await imperative.getUser(), "Alice");
});

test("imperative access rejects outside the browser", async () => {
    const utils = oidcSpa.withUser(anonymousFactory).createUtils();
    const previousWindow = globalThis.window;
    Reflect.deleteProperty(globalThis, "window");
    try {
        await assert.rejects(utils.getOidc(), /cannot be used on the server/);
    } finally {
        globalThis.window = previousWindow;
    }
});

test("deeply equal users preserve the signal value without recomputing consumers", async () => {
    const core = resetCore();
    let name = "Alice";
    const utils = oidcSpa.withUser(() => ({ name, roles: ["member"] })).createUtils();
    const { injector, initialization } = app([utils.provideOidc(params)]);
    core.ready.resolve();
    await initialization.donePromise;
    const oidc = runInInjectionContext(injector, () => utils.injectOidc({ assert: "user logged in" }));
    let computations = 0;
    const label = computed(() => {
        computations++;
        return oidc.user().name;
    });
    const initial = oidc.user();
    assert.equal(label(), "Alice");
    await oidc.refreshUser();
    assert.equal(oidc.user(), initial);
    assert.equal(label(), "Alice");
    assert.equal(computations, 1);
    name = "Bob";
    await oidc.refreshUser();
    assert.equal(label(), "Bob");
    assert.equal(computations, 2);
});

test("undefined is a valid application user", async () => {
    const utils = oidcSpa.withUser(() => undefined).createUtils();
    const { injector, initialization } = app([utils.provideOidc({ mode: "mock" })]);
    await initialization.donePromise;
    assert.equal(
        runInInjectionContext(injector, () => utils.injectOidc({ assert: "user logged in" })).user(),
        undefined
    );
});

test("unexpected non-blocking initialization errors reach Angular's ErrorHandler", async () => {
    const core = resetCore();
    const cause = new Error("unexpected core failure");
    core.error = cause;
    const errors: unknown[] = [];
    const utils = oidcSpa.withUser(anonymousFactory).withNonBlockingRendering().createUtils();
    const { initialization } = app([
        utils.provideOidc(params),
        { provide: ErrorHandler, useValue: { handleError: (error: unknown) => errors.push(error) } }
    ]);
    await initialization.donePromise;
    core.ready.resolve();
    await tick();
    assert.deepEqual(errors, [cause]);
});

for (const failure of ["configs", "user"] as const) {
    test(`non-blocking auto-login exposes ${failure} errors after the gate resolves`, async () => {
        const core = resetCore();
        const cause = new Error("initialization failed");
        const utils = oidcSpa
            .withAutoLogin()
            .withNonBlockingRendering()
            .withUser(() => {
                throw cause;
            })
            .createUtils();
        const { injector, initialization } = app([
            utils.provideOidc(
                failure === "configs"
                    ? async () => {
                          throw cause;
                      }
                    : params
            )
        ]);
        const oidc = runInInjectionContext(injector, utils.injectOidc);
        const errorSignal = runInInjectionContext(injector, utils.injectOidcInitializationError);
        assert.throws(errorSignal, /before core authentication is ready/);
        await initialization.donePromise;
        core.ready.resolve();
        await oidc.prInitialized;
        assert.ok(errorSignal() instanceof OidcInitializationError);
    });
}

test("a navigation cancelled before core is ready cannot redirect or install a return URL", async () => {
    const core = resetCore();
    const utils = oidcSpa
        .withUser(() => "Alice")
        .withNonBlockingRendering()
        .createUtils();
    let navigation: { id: number } | null = { id: 1 };
    const events = new Subject();
    const { injector } = app([
        utils.provideOidc(params),
        { provide: Router, useValue: { events, getCurrentNavigation: () => navigation } }
    ]);
    const guard = runInInjectionContext(injector, () =>
        utils.enforceLoginGuard(route, routerState("/cancelled"))
    );
    navigation = null;
    core.ready.resolve();
    assert.equal(await guard, true);
    const oidc = await utils.getOidc({ assert: "user logged in" });
    await oidc.getTokens({ scopes: ["email"] });
    assert.equal(core.tokenRequests.slice(-1)[0]?.returnToUrl, undefined);
    assert.equal(core.loginParams, undefined);
});
