import "@angular/compiler";
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
    APP_ID,
    APP_BOOTSTRAP_LISTENER,
    ApplicationInitStatus,
    computed,
    createEnvironmentInjector,
    EnvironmentInjector,
    ErrorHandler,
    inject,
    InjectionToken,
    Injector,
    PLATFORM_ID,
    provideZonelessChangeDetection,
    runInInjectionContext,
    TransferState,
    ɵINJECTOR_SCOPE,
    ɵConsole,
    ɵChangeDetectionScheduler,
    type EnvironmentProviders,
    type Provider
} from "@angular/core";
import { DOCUMENT } from "@angular/common";
import { provideLocationMocks } from "@angular/common/testing";
import {
    HttpClient,
    HttpContext,
    HttpContextToken,
    HttpErrorResponse,
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
    provideRouter,
    RedirectCommand,
    Router,
    withNavigationErrorHandler,
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
const history = { pushState() {}, replaceState() {} };
const document = {
    getElementById: () => null,
    querySelector: () => ({ getAttribute: () => "/" }),
    cookie: ""
};
Object.assign(globalThis, {
    window: { location, history, document, setTimeout, clearTimeout },
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
    if (req.context.get(OPTIONAL)) return oidc.isUserLoggedIn === true;
    return false;
}

test(`injectable user lifecycle with authenticated HttpClient`, { timeout: 3000 }, async t => {
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
    const utils = base.createUtils();
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
    const readOidc = () => oidc;
    assert.equal(readOidc().user, undefined);
    assert.equal(readOidc().isOidcReady, false);
    assert.equal(readOidc().isUserLoggedIn, undefined);
    const config = http.expectOne("/oidc-config.json");
    assert.equal(config.request.headers.has("Authorization"), false);
    config.flush({ ...params, warnUserSecondsBeforeAutoLogout: 12 });
    await tick();
    assert.equal(initialization.done, true);
    core.ready.resolve();
    await tick();
    assert.equal(readOidc().isOidcReady, false);
    assert.equal(readOidc().isUserLoggedIn, undefined);
    assert.equal(initialization.done, true);
    assert.equal(core.params?.warnUserSecondsBeforeAutoLogout, 12);
    const request = http.expectOne("/api/user");
    assert.equal(core.renewals, 0, "initialization must use the tokens just issued");
    assert.equal(request.request.headers.get("Authorization"), "Bearer access-token-1");
    request.flush({ displayName: "Alice" });
    await tick();
    await initialization.donePromise;
    await tick();
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
});

test("optional and required requests go through without a token when the user is logged out", async () => {
    const core = resetCore();
    core.loggedIn = false;
    let evaluations = 0;
    const predicateError = new Error("broken predicate");
    const utils = oidcSpa.withUser(anonymousFactory).createUtils();
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
    assert.equal(evaluations, 1);
    const request = testing.expectOne("/optional");
    assert.equal(request.request.headers.has("Authorization"), false);
    request.flush("public");
    await response;
    const required = firstValueFrom(
        http.get("/required", { context: new HttpContext().set(REQUIRED, true) })
    );
    await tick();
    const requiredRequest = testing.expectOne("/required");
    assert.equal(requiredRequest.request.headers.has("Authorization"), false);
    requiredRequest.flush("unauthorized", { status: 401, statusText: "Unauthorized" });
    await assert.rejects(required, (error: { status?: number }) => error.status === 401);
    const oidc = runInInjectionContext(injector, () => utils.injectOidc());
    assert.equal(oidc.user, undefined);
    testing.verify();
});

for (const failure of ["configs", "core", "callback", "token"] as const) {
    test(`the interceptor preserves the HTTP error after a ${failure} failure`, async () => {
        const core = resetCore();
        const initializationError = new OidcInitializationError({
            isAuthServerLikelyDown: true,
            messageOrCause: "issuer unavailable"
        });
        const createOidc = core.createOidc;
        if (failure === "core") {
            core.createOidc = async () => {
                throw initializationError;
            };
        }
        if (failure === "callback") core.error = initializationError;
        if (failure === "token") {
            core.createOidc = async configs => {
                const oidc = await createOidc(configs);
                assert(oidc.isUserLoggedIn);
                oidc.getAccessToken = async () => {
                    throw initializationError;
                };
                return oidc;
            };
        }
        const utils = oidcSpa.withUser(anonymousFactory).createUtils();
        const errors: unknown[] = [];
        const { injector } = app([
            utils.provideOidc(() => {
                if (failure === "configs") throw initializationError;
                return params;
            }),
            provideHttpClient(
                withInterceptors([utils.createOidcInterceptor({ shouldInjectAccessToken: () => true })])
            ),
            provideHttpClientTesting(),
            { provide: ErrorHandler, useValue: { handleError: (error: unknown) => errors.push(error) } }
        ]);
        const response = firstValueFrom(
            injector.get(HttpClient).get("/api", { headers: { Authorization: "Existing credential" } })
        );
        const testing = injector.get(HttpTestingController);
        core.ready.resolve();
        await tick();
        const request = testing.expectOne("/api");
        assert.equal(request.request.headers.get("Authorization"), "Existing credential");
        request.flush({ message: "unauthorized" }, { status: 401, statusText: "Unauthorized" });
        await assert.rejects(response, error => {
            assert(error instanceof HttpErrorResponse);
            assert.equal(error.status, 401);
            assert.deepEqual(error.error, { message: "unauthorized" });
            return true;
        });
        assert.deepEqual(errors, []);
        testing.verify();
    });
}

for (const isAsync of [false, true]) {
    test(`runtime config errors settle initialization, async=${isAsync}`, async () => {
        const core = resetCore();
        const cause = new Error("config failed");
        const base = oidcSpa.withUser(anonymousFactory);
        const utils = base.createUtils();
        const getter = () => {
            throw cause;
        };
        const { injector, initialization } = app([
            utils.provideOidc(isAsync ? async () => getter() : getter)
        ]);
        await initialization.donePromise;
        await tick();
        const oidc = runInInjectionContext(injector, () => utils.injectOidc());
        const error = oidc.initializationError;
        assert.ok(error instanceof OidcInitializationError);
        assert.equal(error.isAuthServerLikelyDown, false);
        assert.equal(causeOf(causeOf(error) as Error), cause);
        assert.equal(core.calls, 0);
        assert.equal(oidc.isOidcReady, false);
        assert.equal(oidc.isUserLoggedIn, undefined);
        const imperative = await utils.getOidc();
        assert.equal(imperative.isUserLoggedIn, false);
        assert.equal(imperative.initializationError, error);
        assert.equal(imperative.issuerUri, "https://not-resolved-yet");
        assert.equal(imperative.clientId, "not-resolved-yet");
        assert.equal(imperative.validRedirectUri, "https://app.test/");
        assert.equal(await utils.getOidc(), imperative);
        await assert.rejects(utils.getOidc({ assert: "user logged in" }), /not currently logged in/);
        assert.throws(
            () => runInInjectionContext(injector, () => utils.injectOidc({ assert: "user logged in" })),
            /before auth state was established/
        );
        await assert.rejects(
            imperative.login!({ doesCurrentHrefEnforceLogin: false }),
            e => e === error
        );
    });
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
        const errors: unknown[] = [];
        const { initialization } = app([
            utils.provideOidc(params),
            { provide: ErrorHandler, useValue: { handleError: (error: unknown) => errors.push(error) } }
        ]);
        core.ready.resolve();
        await initialization.donePromise;
        await tick();
        assert.deepEqual(errors, [cause]);
    }
});

test(`core initialization failures use the UI error path`, async () => {
    const core = resetCore();
    core.error = new OidcInitializationError({
        messageOrCause: "issuer unavailable",
        isAuthServerLikelyDown: true
    });
    const base = oidcSpa.withUser(anonymousFactory);
    const utils = base.createUtils();
    const { injector, initialization } = app([utils.provideOidc(params)]);
    core.ready.resolve();
    await initialization.donePromise;
    await tick();
    const oidc = runInInjectionContext(injector, () => utils.injectOidc());
    assert.equal(oidc.isOidcReady, true);
    assert.equal(oidc.isUserLoggedIn, false);
    assert.equal(oidc.initializationError, core.error);
    assert.equal((await utils.getOidc()).initializationError, core.error);
    await assert.rejects(utils.getOidc({ assert: "user logged in" }), /not currently logged in/);
});

for (const issuerUri of ["/realms/demo/", "https://auth.test/realms/demo/"]) {
    test(`thrown core failures expose metadata and preserve protected-route errors: ${issuerUri}`, async () => {
        const core = resetCore();
        const error = new OidcInitializationError({
            isAuthServerLikelyDown: false,
            messageOrCause: "client initialization failed"
        });
        core.createOidc = async () => {
            throw error;
        };
        const utils = oidcSpa.withUser(anonymousFactory).createUtils();
        const { injector, initialization } = app([
            utils.provideOidc({ mode: "real", issuerUri, clientId: "configured-client" }),
            { provide: Router, useValue: { events: new Subject(), getCurrentNavigation: () => null } }
        ]);
        await initialization.donePromise;
        await tick();
        const injected = runInInjectionContext(injector, () => utils.injectOidc());
        const imperative = await utils.getOidc();
        assert.equal(injected.isOidcReady, false);
        assert.equal(injected.issuerUri, undefined);
        assert.equal(injected.initializationError, error);
        assert.equal(imperative.initializationError, error);
        assert.equal(
            imperative.issuerUri,
            issuerUri.startsWith("/") ? "https://app.test/realms/demo" : "https://auth.test/realms/demo"
        );
        assert.equal(imperative.clientId, "configured-client");
        assert.equal(imperative.validRedirectUri, "https://app.test/");
        await assert.rejects(
            runInInjectionContext(injector, () =>
                utils.enforceLoginGuard(route, routerState("/protected"))
            ),
            e => e === error
        );
    });
}

test(`initial user failure preserves imperative tokens`, async () => {
    const core = resetCore();
    const cause = new Error("profile unavailable");
    const base = oidcSpa.withUser(async () => {
        throw cause;
    });
    const utils = base.createUtils();
    const { injector, initialization } = app([
        utils.provideOidc(params),
        { provide: Router, useValue: { events: new Subject(), getCurrentNavigation: () => null } }
    ]);
    const oidc = runInInjectionContext(injector, () => utils.injectOidc());
    core.ready.resolve();
    await initialization.donePromise;
    await tick();
    const error = oidc.initializationError;
    assert.ok(error instanceof OidcInitializationError);
    assert.equal(error.isAuthServerLikelyDown, false);
    assert.equal(oidc.user, undefined);
    const imperative = await utils.getOidc({ assert: "user logged in" });
    assert.match(await imperative.getAccessToken(), /^access-token-/);
    assert.equal(oidc.isOidcReady, false);
    assert.equal(oidc.isUserLoggedIn, undefined);
    await assert.rejects(
        runInInjectionContext(injector, () => utils.enforceLoginGuard(route, routerState("/protected"))),
        e => e === error
    );
});

test(`mock user factory and runtime token overrides`, async () => {
    const core = resetCore();
    const calls: unknown[] = [];
    const base = oidcSpa.withUser<{ name: unknown; suffix: string }>(
        ({ isMock, idTokenClaims, accessToken, user_current }) => {
            calls.push({ isMock, idTokenClaims, accessToken, user_current });
            return { name: idTokenClaims.name, suffix: inject(INJECTED_NAME) };
        }
    );
    const first = base.createUtils();
    const second = base.createUtils();
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
    await Promise.all([first.getOidc(), second.getOidc()]);
    await tick();
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

test("builder branches are independent and expose one authentication API", async () => {
    const core = resetCore();
    const base = oidcSpa.withUser(() => "Alice");
    const utils = base.createUtils();
    assert.equal(typeof utils.enforceLoginGuard, "function");
    assert.equal("withNonBlockingRendering" in base, false);
    assert.equal("withAutoLogin" in base, false);
    assert.equal("injectOidcInitializationError" in utils, false);
    const first = app([utils.provideOidc(params)]);
    assert.equal(first.initialization.done, true);
    core.ready.resolve();
    await first.initialization.donePromise;
    await utils.getOidc();
    await tick();
    assert.ok(core.params);
    assert.equal("autoLogin" in core.params, false);
    assert.equal(
        runInInjectionContext(first.injector, () => utils.injectOidc()).initializationError,
        undefined
    );
    const other = base.createUtils();
    assert.equal("injectOidcInitializationError" in other, false);
    const second = app([other.provideOidc({ mode: "mock", isUserInitiallyLoggedIn: false })]);
    await second.initialization.donePromise;
    await other.getOidc();
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

for (const shouldFail of [false, true]) {
    test(`guard waits for user creation when already at the destination, failure=${shouldFail}`, async t => {
        const core = resetCore();
        const previousHref = location.href;
        const target = "/protected?tab=profile#details";
        location.href = "https://app.test/base" + target;
        t.after(() => {
            location.href = previousHref;
        });
        let resolveUser!: (user: string) => void;
        let rejectUser!: (error: Error) => void;
        const utils = oidcSpa
            .withUser(
                () =>
                    new Promise<string>((resolve, reject) => {
                        resolveUser = resolve;
                        rejectUser = reject;
                    })
            )
            .createUtils();
        const { injector } = app([
            utils.provideOidc(params),
            { provide: Router, useValue: { events: new Subject(), getCurrentNavigation: () => null } }
        ]);
        const oidc = runInInjectionContext(injector, () => utils.injectOidc());
        let settled = false;
        const guard = runInInjectionContext(injector, () =>
            utils.enforceLoginGuard(route, routerState(target))
        );
        const outcome = guard.then(
            value => {
                settled = true;
                return value;
            },
            error => {
                settled = true;
                return error;
            }
        );
        core.ready.resolve();
        await tick();
        assert.equal(settled, false);
        const imperative = await utils.getOidc({ assert: "user logged in" });
        assert.match(await imperative.getAccessToken(), /^access-token-/);
        if (shouldFail) {
            const cause = new Error("profile unavailable");
            rejectUser(cause);
            const error = await outcome;
            assert.ok(error instanceof OidcInitializationError);
            assert.equal(causeOf(error), cause);
            await tick();
            assert.equal(oidc.initializationError, error);
            assert.equal(oidc.isOidcReady, false);
            assert.equal(oidc.isUserLoggedIn, undefined);
        } else {
            resolveUser("Alice");
            assert.equal(await outcome, true);
            await tick();
            assert.equal(oidc.user!(), "Alice");
        }
        assert.equal(core.loginParams, undefined);
    });
}

test("a user cached before the adapter subscribes initializes the user signal", async () => {
    const core = resetCore();
    const createOidc = core.createOidc;
    core.createOidc = async params => {
        const oidc = await createOidc(params);
        assert.ok(oidc.isUserLoggedIn);
        await oidc.getUser();
        return oidc;
    };
    const user = { displayName: "Alice" };
    const utils = oidcSpa.withUser(() => user).createUtils();
    const { injector, initialization } = app([utils.provideOidc(params)]);
    core.ready.resolve();
    await initialization.donePromise;
    await tick();
    const oidc = runInInjectionContext(injector, () => utils.injectOidc({ assert: "user logged in" }));
    assert.equal(oidc.user(), user);
    assert.equal(await (await utils.getOidc({ assert: "user logged in" })).getUser(), user);
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
        await tick();
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
            /before auth state was established/
        );
        core.ready.resolve();
        await initialization.donePromise;
        await tick();
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
            void oidc.login!({ returnToUrl: "/protected" });
            await tick();
            assert.deepEqual(core.loginParams, {
                doesCurrentHrefEnforceLogin: false,
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
    await tick();
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
        .createUtils();
    const { injector } = app([utils.provideOidc(params)]);
    const oidc = runInInjectionContext(injector, () => utils.injectOidc());
    core.ready.resolve();
    const imperative = await utils.getOidc({ assert: "user logged in" });
    assert.match(await imperative.getAccessToken(), /^access-token-/);
    assert.equal(oidc.user, undefined);
    assert.equal(oidc.isOidcReady, false);
    imperative.subscribeToTokensChange(() => {});
    imperative.subscribeToUserChange(() => {});
    imperative.subscribeToAutoLogoutState(() => {});
    injector.destroy();
    resolveUser("Alice");
    await tick();
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
    await tick();
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

test(`SSR leaves auth pending`, async () => {
    const core = resetCore();
    let userCalls = 0;
    let configCalls = 0;
    const base = oidcSpa.withUser(() => {
        userCalls++;
        return "Alice";
    });
    const utils = base.createUtils();
    const { injector, initialization } = app([
        utils.provideOidc(() => {
            configCalls++;
            return params;
        }),
        { provide: PLATFORM_ID, useValue: "server" }
    ]);
    await initialization.donePromise;
    await tick();
    const oidc = runInInjectionContext(injector, () => utils.injectOidc());
    assert.equal(
        runInInjectionContext(injector, () => utils.injectOidc()),
        oidc
    );
    assert.equal(oidc.isOidcReady, false);
    assert.equal(configCalls, 0);
    assert.equal(core.calls, 0);
    assert.equal(userCalls, 0);
    assert.equal(oidc.isUserLoggedIn, undefined);
    assert.equal(oidc.user, undefined);
    assert.equal(oidc.isOidcReady, false);
    await assert.rejects(
        runInInjectionContext(injector, () => utils.enforceLoginGuard(route)),
        /enforceLoginGuard.*RenderMode.Client.*app.routes.server.ts/
    );
});

test("the first client render matches SSR even when core is already ready", async () => {
    const core = resetCore();
    core.loggedIn = false;
    const utils = oidcSpa.withUser(anonymousFactory).createUtils();
    const server = app([utils.provideOidc(params), { provide: PLATFORM_ID, useValue: "server" }]);
    const serverOidc = runInInjectionContext(server.injector, () => utils.injectOidc());
    assert.equal(serverOidc.isOidcReady, false);
    assert.equal(core.calls, 0);

    const appId = "oidc-hydration-test";
    const transferScript = {
        tagName: "SCRIPT",
        textContent: server.injector.get(TransferState).toJson()
    };
    const originalDocument = globalThis.document;
    const browserDocument = {
        ...document,
        getElementById: (id: string) => (id === `${appId}-state` ? transferScript : null)
    };
    const browser = (() => {
        globalThis.document = browserDocument as unknown as Document;
        try {
            return app([
                { provide: APP_ID, useValue: appId },
                { provide: DOCUMENT, useValue: browserDocument },
                utils.provideOidc(params)
            ]);
        } finally {
            globalThis.document = originalDocument;
        }
    })();
    const browserOidc = runInInjectionContext(browser.injector, () => utils.injectOidc());
    const label = computed(() => (browserOidc.isOidcReady ? "ready" : "pending"));
    core.ready.resolve();
    assert.equal((await utils.getOidc()).isUserLoggedIn, false);
    assert.equal(label(), "pending");
    assert.equal(browserOidc.isUserLoggedIn, serverOidc.isUserLoggedIn);
    for (const listener of browser.injector.get(APP_BOOTSTRAP_LISTENER)) {
        listener({} as Parameters<typeof listener>[0]);
    }
    assert.equal(label(), "ready");
});

test("SSR runtimes do not capture or release the active browser app", async () => {
    const utils = oidcSpa.withUser(() => "Alice").createUtils();
    const browser = app([utils.provideOidc({ mode: "mock" })]);
    const imperative = await utils.getOidc({ assert: "user logged in" });
    const serverApps = [0, 1].map(() =>
        app([utils.provideOidc({ mode: "mock" }), { provide: PLATFORM_ID, useValue: "server" }])
    );
    const serverOidcs = serverApps.map(({ injector }) =>
        runInInjectionContext(injector, () => utils.injectOidc())
    );
    assert.notEqual(serverOidcs[0], serverOidcs[1]);
    assert(serverOidcs.every(oidc => oidc.isOidcReady === false));
    serverApps.forEach(({ injector }) => injector.destroy());
    assert.equal(await utils.getOidc(), imperative);
    await imperative.getUser();
    await tick();
    assert.equal(runInInjectionContext(browser.injector, () => utils.injectOidc()).isOidcReady, true);
    assert.equal(await imperative.getUser(), "Alice");
});

test("imperative access rejects outside the browser", async () => {
    const utils = oidcSpa.withUser(anonymousFactory).createUtils();
    const previousWindow = globalThis.window;
    Reflect.deleteProperty(globalThis, "window");
    try {
        await assert.rejects(utils.getOidc(), /can't be used on the server/);
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
    await tick();
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
    await tick();
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
    const utils = oidcSpa.withUser(anonymousFactory).createUtils();
    const { initialization } = app([
        utils.provideOidc(params),
        { provide: ErrorHandler, useValue: { handleError: (error: unknown) => errors.push(error) } }
    ]);
    let settled = false;
    void utils.getOidc().then(
        () => (settled = true),
        () => (settled = true)
    );
    await initialization.donePromise;
    await tick();
    core.ready.resolve();
    await tick();
    assert.deepEqual(errors, [cause]);
    assert.equal(settled, false);
});

for (const failure of ["configs", "user"] as const) {
    test(`the pending state exposes ${failure} errors`, async () => {
        const core = resetCore();
        const cause = new Error("initialization failed");
        const utils = oidcSpa
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
        const oidc = runInInjectionContext(injector, () => utils.injectOidc());
        const getInitializationError = () => oidc.initializationError;
        assert.equal(getInitializationError(), undefined);
        await initialization.donePromise;
        await tick();
        core.ready.resolve();
        await tick();
        assert.ok(getInitializationError() instanceof OidcInitializationError);
    });
}

test("a navigation cancelled before core is ready cannot redirect or install a return URL", async () => {
    const core = resetCore();
    const utils = oidcSpa.withUser(() => "Alice").createUtils();
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

for (const failure of ["configs", "core", "user"] as const) {
    test(`router alerts and redirects home after ${failure} initialization errors`, async t => {
        const core = resetCore();
        const cause = new Error("initialization failed");
        if (failure === "core") {
            core.error = new OidcInitializationError({
                authResponse: { error: "access_denied", error_description: "Authorization refused" }
            });
        }
        const utils = oidcSpa
            .withUser(() => {
                if (failure === "user") throw cause;
                return "Alice";
            })
            .createUtils();
        const errors: NavigationError[] = [];
        const alert = t.mock.fn();
        const { injector, initialization } = app([
            provideZonelessChangeDetection(),
            { provide: ɵConsole, useValue: console },
            ErrorHandler,
            provideLocationMocks(),
            provideRouter(
                [
                    { path: "protected", canActivate: [utils.enforceLoginGuard], children: [] },
                    { path: "", pathMatch: "full", children: [] }
                ],
                withNavigationErrorHandler(event => {
                    errors.push(event);
                    if (event.error instanceof OidcInitializationError) {
                        alert(event.error.message);
                        return new RedirectCommand(inject(Router).parseUrl("/"));
                    }
                    return undefined;
                })
            ),
            utils.provideOidc(
                failure === "configs"
                    ? async () => {
                          throw cause;
                      }
                    : params
            )
        ]);
        core.ready.resolve();
        await initialization.donePromise;
        await tick();
        const oidc = runInInjectionContext(injector, () => utils.injectOidc());
        assert.ok(oidc.initializationError instanceof OidcInitializationError);
        const router = injector.get(Router);
        assert.equal(await router.navigateByUrl("/protected?tab=profile#details"), true);
        assert.equal(router.url, "/");
        assert.equal(errors.length, 1);
        assert.equal(errors[0].error, oidc.initializationError);
        assert.equal(alert.mock.calls.length, 1);
        assert.equal(alert.mock.calls[0].arguments[0], oidc.initializationError.message);
        assert.equal(core.loginParams, undefined);
    });
}

test("a navigation cancelled while constructing the user does not surface its error", async () => {
    const core = resetCore();
    let rejectUser!: (error: Error) => void;
    const utils = oidcSpa
        .withUser(
            () =>
                new Promise<string>((_, reject) => {
                    rejectUser = reject;
                })
        )
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
    core.ready.resolve();
    await tick();
    navigation = null;
    events.next(
        new NavigationCancel(
            1,
            "/cancelled",
            "cancelled",
            NavigationCancellationCode.SupersededByNewNavigation
        )
    );
    rejectUser(new Error("profile unavailable"));
    assert.equal(await guard, true);
    const oidc = await utils.getOidc({ assert: "user logged in" });
    await oidc.getTokens({ scopes: ["email"] });
    assert.equal(core.tokenRequests.slice(-1)[0]?.returnToUrl, undefined);
});
