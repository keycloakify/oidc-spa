import "@angular/compiler";
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
    ApplicationInitStatus,
    createEnvironmentInjector,
    EnvironmentInjector,
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
import { Router, type ActivatedRouteSnapshot, type RouterStateSnapshot } from "@angular/router";
import { firstValueFrom } from "rxjs";
import { oidcSpa, OidcAccessedTooEarlyError, type OidcService } from "../../src/angular";
import { OidcInitializationError } from "../../src/core/OidcInitializationError";
import { getDesiredPostLoginRedirectUrl } from "../../src/core/desiredPostLoginRedirectUrl";
import { resetCore } from "./core";

const location = new URL("https://app.test/");
const history = { pushState() {}, replaceState() {} };
const document = { querySelector: () => ({ getAttribute: () => "/" }), cookie: "" };
Object.assign(globalThis, { window: { location, history, document }, location, history, document });
const OPTIONAL = new HttpContextToken(() => false);
const REQUIRED = new HttpContextToken(() => false);
const INJECTED_NAME = new InjectionToken<string>("name");
const API = new InjectionToken("UserApi", {
    factory: () => {
        const http = inject(HttpClient);
        // Services may inject Oidc in their own factory; the public object must already exist.
        return {
            getUser: () =>
                http.get<{ displayName: string }>("/api/user", {
                    context: new HttpContext().set(OPTIONAL, true)
                })
        };
    }
});
const params = { issuerUri: "https://issuer.test", clientId: "client" };
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
afterEach(() => {
    injectors.splice(0).forEach(injector => {
        if (!injector.destroyed) injector.destroy();
    });
});
function predicate(oidc: OidcService<boolean, unknown>, req: HttpRequest<unknown>) {
    if (req.context.get(REQUIRED)) return true;
    if (req.context.get(OPTIONAL)) return oidc.isUserLoggedIn;
    return false;
}

for (const nonBlocking of [false, true]) {
    test(
        `authenticated injectable createUser and refresh, nonBlocking=${nonBlocking}`,
        { timeout: 3000 },
        async () => {
            const core = resetCore();
            let builds = 0;
            const previousUsers: unknown[] = [];
            const base = oidcSpa.withUser<{ displayName: string }>({
                createUser: async ({ user_current }) => {
                    const api = inject(API);
                    const suffix = inject(INJECTED_NAME);
                    builds++;
                    previousUsers.push(user_current);
                    const user = await firstValueFrom(api.getUser());
                    return { displayName: `${user.displayName} ${suffix}` };
                }
            });
            const utils = (nonBlocking ? base.withNonBlockingRendering() : base).createUtils();
            const { Oidc } = utils;
            const { injector, initialization } = app([
                provideHttpClient(
                    withInterceptors([
                        utils.Oidc.createBearerInterceptor({
                            shouldInjectAccessToken: req => predicate(inject(Oidc), req)
                        })
                    ])
                ),
                provideHttpClientTesting(),
                utils.Oidc.provide(async () => {
                    const http = inject(HttpClient);
                    return firstValueFrom(http.get<typeof params>("/oidc-config.json"));
                })
            ]);
            const http = injector.get(HttpTestingController);
            const oidc = injector.get(Oidc);
            const seen: string[] = [];
            oidc.user$.subscribe(user => seen.push(user.displayName));
            assert.throws(() => oidc.$user(), OidcAccessedTooEarlyError);
            assert.throws(() => oidc.isUserLoggedIn, OidcAccessedTooEarlyError);
            const config = http.expectOne("/oidc-config.json");
            assert.equal(config.request.headers.has("Authorization"), false);
            config.flush(params);
            await tick();
            assert.equal(initialization.done, nonBlocking);
            core.ready.resolve();
            await tick();
            assert.equal(oidc.isUserLoggedIn, true);
            assert.equal(initialization.done, nonBlocking);
            let userReady = false;
            void oidc.prInitialized.then(() => {
                userReady = true;
            });
            const userRequest = http.expectOne("/api/user");
            assert.equal(userRequest.request.headers.get("Authorization"), "Bearer access-token-1");
            assert.equal(userReady, false);
            userRequest.flush({ displayName: "Alice" });
            await oidc.prInitialized;
            await initialization.donePromise;
            assert.equal(oidc.initializationError, undefined);
            assert.equal(oidc.$user().displayName, "Alice injected");
            assert.equal(oidc.user$.getValue(), oidc.$user());
            assert.equal((await oidc.getUser()).user, oidc.$user());
            assert.deepEqual(seen, ["Alice injected"]);

            const rotations: string[] = [];
            oidc.accessTokenRotation$.subscribe(token => rotations.push(token));
            core.rotate(); // Routine rotation must not rebuild User.
            await tick();
            assert.equal(builds, 1);
            http.expectNone("/api/user");
            assert.equal(rotations.length, 1);

            core.rotate("Alicia"); // Meaningful ID-token change does rebuild User.
            await tick();
            http.expectOne("/api/user").flush({ displayName: "Alicia" });
            await tick();
            assert.equal(oidc.$user().displayName, "Alicia injected");

            const refreshed = oidc.refreshUser();
            await tick();
            const refreshRequest = http.expectOne("/api/user");
            assert.equal(refreshRequest.request.headers.get("Authorization"), "Bearer access-token-4");
            refreshRequest.flush({ displayName: "Bob" });
            assert.equal((await refreshed).displayName, "Bob injected");
            assert.equal(builds, 3);
            assert.deepEqual(previousUsers, [
                undefined,
                { displayName: "Alice injected" },
                { displayName: "Alicia injected" }
            ]);
            assert.deepEqual(seen, ["Alice injected", "Alicia injected", "Bob injected"]);

            // Core retains the previous model on a later failure.
            const originalConsoleError = console.error;
            const loggedErrors: unknown[] = [];
            console.error = (...args) => {
                loggedErrors.push(args);
            };
            try {
                const failedRefresh = oidc.refreshUser();
                await tick();
                http.expectOne("/api/user").flush("unavailable", {
                    status: 503,
                    statusText: "Unavailable"
                });
                assert.equal((await failedRefresh).displayName, "Bob injected");
                assert.equal(oidc.initializationError, undefined);
                assert.equal(loggedErrors.length, 1);
            } finally {
                console.error = originalConsoleError;
            }

            core.countdownListeners.forEach(next => next({ secondsLeft: 61 }));
            assert.equal(oidc.$secondsLeftBeforeAutoLogout(), null);
            core.countdownListeners.forEach(next => next({ secondsLeft: 0 }));
            assert.equal(oidc.$secondsLeftBeforeAutoLogout(), 0);
            core.countdownListeners.forEach(next => next({ secondsLeft: undefined }));
            assert.equal(oidc.$secondsLeftBeforeAutoLogout(), null);
            http.verify();
            injector.destroy();
            assert.equal(core.tokenListeners.size, 0);
            assert.equal(core.countdownListeners.size, 0);
            assert.equal(core.userSubscriptions, 0);
        }
    );
}

test("requests wait for core and re-evaluate inside the injection context, without simulated states", async () => {
    const core = resetCore();
    core.loggedIn = false;
    let evaluations = 0;
    let builds = 0;
    const utils = oidcSpa
        .withUser({
            createUser: () => {
                builds++;
                return "unused";
            }
        })
        .withNonBlockingRendering()
        .createUtils();
    const { Oidc } = utils;
    const { injector } = app([
        utils.Oidc.provide(params),
        provideHttpClient(
            withInterceptors([
                utils.Oidc.createBearerInterceptor({
                    shouldInjectAccessToken: req => {
                        evaluations++;
                        return predicate(inject(Oidc), req);
                    }
                })
            ])
        ),
        provideHttpClientTesting()
    ]);
    const http = injector.get(HttpClient);
    const testing = injector.get(HttpTestingController);
    const result = firstValueFrom(
        http.get("/optional", { context: new HttpContext().set(OPTIONAL, true) })
    );
    testing.expectNone("/optional");
    assert.equal(evaluations, 1);
    core.ready.resolve();
    await tick();
    const request = testing.expectOne("/optional");
    assert.equal(request.request.headers.has("Authorization"), false);
    assert.equal(evaluations, 2);
    request.flush("public");
    await result;
    assert.equal(builds, 0);
    assert.equal(injector.get(Oidc).isUserLoggedIn, false);
    assert.throws(() => injector.get(Oidc).$user(), /not logged in/);
    assert.deepEqual(await injector.get(Oidc).getAccessToken(), { isUserLoggedIn: false });
    await assert.rejects(
        firstValueFrom(http.get("/required", { context: new HttpContext().set(REQUIRED, true) })),
        /not logged in/
    );
    testing.expectNone("/required");
    testing.verify();
});

for (const isAsync of [false, true]) {
    test(`provider configuration failures propagate unchanged, async=${isAsync}`, async () => {
        const core = resetCore();
        const cause = new Error("config failed");
        const { Oidc } = oidcSpa.createUtils();
        const getParams = () => {
            throw cause;
        };
        const { initialization } = app([Oidc.provide(isAsync ? async () => getParams() : getParams)]);
        await assert.rejects(initialization.donePromise, error => error === cause);
        assert.equal(core.calls, 0);
    });
}

test("unexpected createOidc errors propagate unchanged", async () => {
    const core = resetCore();
    const cause = new Error("unexpected core bug");
    core.error = cause;
    const { Oidc } = oidcSpa.withAutoLogin().createUtils();
    const { initialization } = app([Oidc.provide(params)]);
    core.ready.resolve();
    await assert.rejects(initialization.donePromise, error => error === cause);
});

test("subscription setup errors propagate even when they are OidcInitializationError", async () => {
    const core = resetCore();
    const cause = new OidcInitializationError({
        messageOrCause: "unexpected subscription failure",
        isAuthServerLikelyDown: false
    });
    const createOidc = core.createOidc;
    core.createOidc = async params => {
        const oidc = await createOidc(params);
        assert.ok(oidc.isUserLoggedIn);
        oidc.subscribeToTokensChange = () => {
            throw cause;
        };
        return oidc;
    };
    const { Oidc } = oidcSpa.createUtils();
    const { initialization } = app([Oidc.provide(params)]);
    core.ready.resolve();
    await assert.rejects(initialization.donePromise, error => error === cause);
});

test("core initialization rejection is handled, including auto-login", async () => {
    const core = resetCore();
    core.error = new OidcInitializationError({
        messageOrCause: "auth unavailable",
        isAuthServerLikelyDown: true
    });
    const utils = oidcSpa.withAutoLogin().createUtils();
    const { Oidc } = utils;
    const { injector, initialization } = app([utils.Oidc.provide(params)]);
    core.ready.resolve();
    await initialization.donePromise;
    const oidc = injector.get(Oidc);
    assert.equal(oidc.initializationError, core.error);
    assert.throws(() => oidc.isUserLoggedIn, /auth unavailable/);
    await assert.rejects(oidc.getAccessToken(), /auth unavailable/);
});

for (const nonBlocking of [false, true]) {
    test(`mock user overrides and provider isolation, nonBlocking=${nonBlocking}`, async () => {
        resetCore();
        let builds = 0;
        const base = oidcSpa.withUser({
            createUser: () => {
                builds++;
                return { name: "real" };
            },
            user_mock: { name: "default" }
        });
        const utils = (nonBlocking ? base.withNonBlockingRendering() : base).createUtils();
        const { Oidc } = utils;
        const first = app([utils.Oidc.provideMock()]);
        const second = app([
            utils.Oidc.provideMock({ user_mock: { name: "override" }, mockAccessToken: "custom-token" })
        ]);
        await Promise.all([
            first.injector.get(Oidc).prInitialized,
            second.injector.get(Oidc).prInitialized
        ]);
        assert.notEqual(first.injector.get(Oidc), second.injector.get(Oidc));
        assert.equal(first.injector.get(Oidc).$user().name, "default");
        assert.equal(second.injector.get(Oidc).$user().name, "override");
        assert.equal((await second.injector.get(Oidc).refreshUser()).name, "override");
        assert.deepEqual(await second.injector.get(Oidc).getAccessToken(), {
            isUserLoggedIn: true,
            accessToken: "custom-token"
        });
        assert.equal(builds, 0);
    });
}

test("no user configuration is valid, but reading User explains the missing configuration", async () => {
    const utils = oidcSpa.createUtils();
    const { Oidc } = utils;
    const { injector } = app([utils.Oidc.provideMock()]);
    await injector.get(Oidc).prInitialized;
    assert.equal(injector.get(Oidc).initializationError, undefined);
    assert.throws(() => injector.get(Oidc).$user(), /withUser/);
});

test("builder branches are independent and auto-login reaches core", async () => {
    const core = resetCore();
    const base = oidcSpa.withUser({ createUser: () => "Alice" });
    const utils = base.withAutoLogin().createUtils();
    const { Oidc } = utils;
    const { injector } = app([utils.Oidc.provide(params)]);
    core.ready.resolve();
    await injector.get(Oidc).prInitialized;
    assert.equal(core.params?.autoLogin, true);
    const otherUtils = base.createUtils();
    const Other = otherUtils.Oidc;
    assert.notEqual(Oidc, Other);
    const second = app([otherUtils.Oidc.provideMock({ isUserInitiallyLoggedIn: false })]);
    await second.injector.get(Other).prInitialized;
    assert.equal(second.injector.get(Other).isUserLoggedIn, false);
});

test("guard waits for User and preserves the complete target URL", async () => {
    const core = resetCore();
    let resolveUser!: (user: string) => void;
    const utils = oidcSpa
        .withUser({
            createUser: () =>
                new Promise<string>(resolve => {
                    resolveUser = resolve;
                })
        })
        .withNonBlockingRendering()
        .createUtils();
    const { injector } = app([utils.Oidc.provide(params), { provide: Router, useValue: {} }]);
    const target = "/nested/protected?tab=profile#details";
    let allowed = false;
    const guard = runInInjectionContext(injector, () =>
        utils.Oidc.enforceLoginGuard(
            {} as ActivatedRouteSnapshot,
            { url: target } as RouterStateSnapshot
        )
    );
    void guard.then(() => {
        allowed = true;
    });
    core.ready.resolve();
    await tick();
    assert.equal(allowed, false);
    resolveUser("Alice");
    assert.equal(await guard, true);
    assert.equal(getDesiredPostLoginRedirectUrl(), "https://app.test" + target);
    history.pushState();
    assert.equal(getDesiredPostLoginRedirectUrl(), undefined);
});

test("server provider does not invoke configuration or start browser OIDC", async () => {
    const core = resetCore();
    let configCalls = 0;
    const utils = oidcSpa.createUtils();
    const { initialization } = app([
        utils.Oidc.provide(async () => {
            configCalls++;
            return params;
        }),
        { provide: PLATFORM_ID, useValue: "server" }
    ]);
    await initialization.donePromise;
    assert.equal(configCalls, 0);
    assert.equal(core.calls, 0);
});

for (const autoLogin of [false, true]) {
    test(`initial createUser failure settles UI initialization but leaves tokens usable, autoLogin=${autoLogin}`, async () => {
        const core = resetCore();
        const cause = new Error("profile unavailable");
        const base = oidcSpa.withUser({
            createUser: async () => {
                throw cause;
            }
        });
        const utils = (autoLogin ? base.withAutoLogin() : base).createUtils();
        const { Oidc } = utils;
        const { injector, initialization } = app([
            utils.Oidc.provide(params),
            { provide: Router, useValue: {} }
        ]);
        // This test selects between two token types at runtime.
        const oidc = injector.get<OidcService<boolean>>(Oidc);
        let observableError: unknown;
        oidc.user$.subscribe({
            error: error => {
                observableError = error;
            }
        });
        core.ready.resolve();
        await initialization.donePromise;
        await oidc.prInitialized;
        const error = oidc.initializationError;
        assert.ok(error instanceof OidcInitializationError);
        assert.equal(error.isAuthServerLikelyDown, false);
        assert.equal(
            (error as unknown as Error & { cause: Error & { cause: unknown } }).cause.cause,
            cause
        );
        assert.equal(observableError, error);
        assert.throws(() => oidc.$user(), error);
        assert.deepEqual(await oidc.getAccessToken(), {
            isUserLoggedIn: true,
            accessToken: "access-token-1"
        });
        await assert.rejects(
            runInInjectionContext(injector, () =>
                utils.Oidc.enforceLoginGuard({} as ActivatedRouteSnapshot)
            ),
            error
        );
    });
}

test("user-dependent interceptor fails clearly during createUser instead of waiting on itself", async () => {
    const core = resetCore();
    const utils = oidcSpa
        .withUser({
            createUser: async () => {
                return firstValueFrom(inject(API).getUser());
            }
        })
        .createUtils();
    const { Oidc } = utils;
    const { injector, initialization } = app([
        utils.Oidc.provide(params),
        provideHttpClient(
            withInterceptors([
                utils.Oidc.createBearerInterceptor({
                    shouldInjectAccessToken: () => inject(Oidc).$user().displayName !== ""
                })
            ])
        ),
        provideHttpClientTesting()
    ]);
    core.ready.resolve();
    await initialization.donePromise;
    const error = injector.get(Oidc).initializationError;
    assert.ok(error instanceof OidcInitializationError);
    assert.match(
        String((error as unknown as Error & { cause: Error & { cause: unknown } }).cause.cause),
        /Requests made by createUser/
    );
    injector.get(HttpTestingController).expectNone("/api/user");
});

test("destroying an injector while User is loading does not leak subscriptions", async () => {
    const core = resetCore();
    let resolveUser!: (user: string) => void;
    const utils = oidcSpa
        .withUser({
            createUser: () =>
                new Promise<string>(resolve => {
                    resolveUser = resolve;
                })
        })
        .withNonBlockingRendering()
        .createUtils();
    const { Oidc } = utils;
    const { injector } = app([utils.Oidc.provide(params)]);
    const oidc = injector.get(Oidc);
    core.ready.resolve();
    await tick();
    injector.destroy();
    resolveUser("Alice");
    await oidc.prInitialized;
    assert.equal(core.userSubscriptions, 0);
    assert.equal(core.tokenListeners.size, 0);
    assert.equal(core.countdownListeners.size, 0);
});

test("anonymous guard redirects to the requested nested route", async () => {
    const core = resetCore();
    core.loggedIn = false;
    const utils = oidcSpa.createUtils();
    const { Oidc } = utils;
    const { injector } = app([utils.Oidc.provide(params), { provide: Router, useValue: {} }]);
    core.ready.resolve();
    await injector.get(Oidc).prInitialized;
    void runInInjectionContext(injector, () =>
        utils.Oidc.enforceLoginGuard(
            {} as ActivatedRouteSnapshot,
            {
                url: "/parent/protected?tab=2#section"
            } as RouterStateSnapshot
        )
    );
    await tick();
    assert.deepEqual(core.loginParams, {
        doesCurrentHrefRequiresAuth: false,
        redirectUrl: "https://app.test/parent/protected?tab=2#section"
    });
});
