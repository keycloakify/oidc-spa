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
import { oidcSpa, type InjectOidc } from "../../src/angular";
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
const params = { implementation: "real" as const, issuerUri: "https://issuer.test", clientId: "client" };
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
function predicate(oidc: InjectOidc.Oidc<unknown>, req: HttpRequest<unknown>) {
    if (req.context.get(REQUIRED)) return true;
    if (req.context.get(OPTIONAL)) return oidc.isUserLoggedIn;
    return false;
}

for (const nonBlocking of [false, true]) {
    test(
        `authenticated injectable createUser and refresh, nonBlocking=${nonBlocking}`,
        { timeout: 3000 },
        async t => {
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
            const { injector, initialization } = app([
                provideHttpClient(
                    withInterceptors([
                        utils.createOidcInterceptor({
                            shouldInjectAccessToken: req => predicate(utils.injectOidc(), req)
                        })
                    ])
                ),
                provideHttpClientTesting(),
                utils.provideOidc(async () => {
                    const http = inject(HttpClient);
                    return firstValueFrom(http.get<typeof params>("/oidc-config.json"));
                })
            ]);
            const http = injector.get(HttpTestingController);
            const oidc = runInInjectionContext(injector, () => utils.injectOidc());
            const seen: string[] = [];
            assert.throws(() => oidc.user!(), /User accessed before oidc.prInitialized resolved/);
            assert.throws(() => oidc.isUserLoggedIn, /accessed before core authentication is ready/);
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
            assert.equal(oidc.user!().displayName, "Alice injected");
            const imperative = await utils.getOidc({ assert: "user logged in" });
            const initialUser = await imperative.getUser();
            assert.equal(initialUser.user, oidc.user!());
            const { unsubscribeFromUserChange } = initialUser.subscribeToUserChange(({ user }) =>
                seen.push(user.displayName)
            );

            const rotations: string[] = [];
            imperative.subscribeToAccessTokenRotation(token => rotations.push(token));
            core.rotate(); // Routine rotation must not rebuild User.
            await tick();
            assert.equal(builds, 1);
            http.expectNone("/api/user");
            assert.equal(rotations.length, 1);

            core.rotate("Alicia"); // Meaningful ID-token change does rebuild User.
            await tick();
            http.expectOne("/api/user").flush({ displayName: "Alicia" });
            await tick();
            assert.equal(oidc.user!().displayName, "Alicia injected");

            const refreshed = oidc.refreshUser!();
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
            assert.deepEqual(seen, ["Alicia injected", "Bob injected"]);

            // Core retains the previous model on a later failure.
            const loggedErrors: unknown[] = [];
            const log = t.mock.method(console, "error", (...args: unknown[]) => {
                loggedErrors.push(args);
            });
            const failedRefresh = oidc.refreshUser!();
            await tick();
            http.expectOne("/api/user").flush("unavailable", {
                status: 503,
                statusText: "Unavailable"
            });
            assert.equal((await failedRefresh).displayName, "Bob injected");
            assert.equal(oidc.initializationError, undefined);
            assert.equal(loggedErrors.length, 1);
            log.mock.restore();

            core.countdownListeners.forEach(next => next({ secondsLeft: 61 }));
            assert.deepEqual(oidc.autoLogoutState(), { shouldDisplayWarning: false });
            core.countdownListeners.forEach(next => next({ secondsLeft: 0 }));
            assert.deepEqual(oidc.autoLogoutState(), {
                shouldDisplayWarning: true,
                secondsLeftBeforeAutoLogout: 0
            });
            core.countdownListeners.forEach(next => next({ secondsLeft: undefined }));
            assert.deepEqual(oidc.autoLogoutState(), { shouldDisplayWarning: false });
            http.verify();
            unsubscribeFromUserChange();
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
    const predicateError = new Error("broken predicate");
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
    const { injector } = app([
        utils.provideOidc(params),
        provideHttpClient(
            withInterceptors([
                utils.createOidcInterceptor({
                    shouldInjectAccessToken: req => {
                        if (req.url === "/broken-predicate") {
                            throw predicateError;
                        }
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
    await assert.rejects(
        firstValueFrom(http.get("/broken-predicate")),
        error => error === predicateError
    );
    testing.expectNone("/broken-predicate");
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
    assert.equal(runInInjectionContext(injector, () => utils.injectOidc()).isUserLoggedIn, false);
    assert.throws(
        () => runInInjectionContext(injector, () => utils.injectOidc()).user!(),
        /not logged in/
    );
    await assert.rejects(
        runInInjectionContext(injector, () => utils.injectOidc()).getAccessToken!(),
        /not logged in/
    );
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
        const utils = oidcSpa.createUtils();
        const getParams = () => {
            throw cause;
        };
        const { initialization } = app([
            utils.provideOidc(isAsync ? async () => getParams() : getParams)
        ]);
        await assert.rejects(initialization.donePromise, error => error === cause);
        assert.equal(core.calls, 0);
    });
}

test("unexpected createOidc errors propagate unchanged", async () => {
    const core = resetCore();
    const cause = new Error("unexpected core bug");
    core.error = cause;
    const utils = oidcSpa.withAutoLogin().createUtils();
    const { initialization } = app([utils.provideOidc(params)]);
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
        oidc.subscribeToAutoLogoutCountdown = () => {
            throw cause;
        };
        return oidc;
    };
    const utils = oidcSpa.createUtils();
    const { initialization } = app([utils.provideOidc(params)]);
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
    const { injector, initialization } = app([utils.provideOidc(params)]);
    core.ready.resolve();
    await initialization.donePromise;
    const oidc = runInInjectionContext(injector, () => utils.injectOidc());
    assert.equal(oidc.initializationError, core.error);
    assert.throws(() => oidc.isUserLoggedIn, /auth unavailable/);
    await assert.rejects(oidc.getAccessToken!(), /auth unavailable/);
});

for (const nonBlocking of [false, true]) {
    test(`mock overrides and independent applications, nonBlocking=${nonBlocking}`, async () => {
        resetCore();
        let builds = 0;
        const base = oidcSpa.withUser({
            createUser: () => {
                builds++;
                return { name: "real" };
            },
            user_mock: { name: "default" }
        });
        const builder = nonBlocking ? base.withNonBlockingRendering() : base;
        const first = builder.createUtils();
        const second = builder.createUtils();
        const firstApp = app([
            first.provideOidc({ implementation: "mock", isUserInitiallyLoggedIn: true })
        ]);
        const secondApp = app([
            second.provideOidc({
                implementation: "mock",
                isUserInitiallyLoggedIn: true,
                user_mock: { name: "override" },
                issuerUri_mock: "https://other.test",
                clientId_mock: "other"
            })
        ]);
        const a = runInInjectionContext(firstApp.injector, () => first.injectOidc());
        const b = runInInjectionContext(secondApp.injector, () => second.injectOidc());
        await Promise.all([a.prInitialized, b.prInitialized]);
        assert.notEqual(a, b);
        assert.equal(a.user!().name, "default");
        assert.equal(b.user!().name, "override");
        assert.equal((await b.refreshUser!()).name, "override");
        assert.equal((await second.getOidc()).issuerUri, "https://other.test");
        assert.equal((await second.getOidc()).clientId, "other");
        assert.equal(builds, 0);
    });
}

test("no user configuration is valid, but reading User explains the missing configuration", async () => {
    const utils = oidcSpa.createUtils();
    const { injector } = app([
        utils.provideOidc({ implementation: "mock", isUserInitiallyLoggedIn: true })
    ]);
    await runInInjectionContext(injector, () => utils.injectOidc()).prInitialized;
    assert.equal(
        runInInjectionContext(injector, () => utils.injectOidc()).initializationError,
        undefined
    );
    assert.throws(() => runInInjectionContext(injector, () => utils.injectOidc()).user!(), /withUser/);
});

test("builder branches are independent and auto-login reaches core", async () => {
    const core = resetCore();
    const base = oidcSpa.withUser({ createUser: () => "Alice" });
    const utils = base.withAutoLogin().createUtils();
    const { injector } = app([utils.provideOidc(params)]);
    core.ready.resolve();
    await runInInjectionContext(injector, () => utils.injectOidc()).prInitialized;
    assert.equal(core.params?.autoLogin, true);
    const otherUtils = base.createUtils();
    const second = app([
        otherUtils.provideOidc({ implementation: "mock", isUserInitiallyLoggedIn: false })
    ]);
    await runInInjectionContext(second.injector, () => otherUtils.injectOidc()).prInitialized;
    assert.equal(
        runInInjectionContext(second.injector, () => otherUtils.injectOidc()).isUserLoggedIn,
        false
    );
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
    const { injector } = app([utils.provideOidc(params), { provide: Router, useValue: {} }]);
    const target = "/nested/protected?tab=profile#details";
    let allowed = false;
    const guard = runInInjectionContext(injector, () =>
        utils.enforceLoginGuard({} as ActivatedRouteSnapshot, { url: target } as RouterStateSnapshot)
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
        utils.provideOidc(async () => {
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
        const { injector, initialization } = app([
            utils.provideOidc(params),
            { provide: Router, useValue: {} }
        ]);
        const oidc = runInInjectionContext(injector, () => utils.injectOidc());
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
        assert.throws(() => oidc.user!(), error);
        assert.equal(await oidc.getAccessToken!(), "access-token-1");
        const imperative = await utils.getOidc({ assert: "user logged in" });
        assert.equal(await imperative.getAccessToken(), "access-token-1");
        if ("enforceLoginGuard" in utils) {
            await assert.rejects(
                runInInjectionContext(injector, () =>
                    utils.enforceLoginGuard({} as ActivatedRouteSnapshot)
                ),
                error
            );
        }
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
    const { injector } = app([utils.provideOidc(params)]);
    const oidc = runInInjectionContext(injector, () => utils.injectOidc());
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
    const { injector } = app([utils.provideOidc(params), { provide: Router, useValue: {} }]);
    core.ready.resolve();
    await runInInjectionContext(injector, () => utils.injectOidc()).prInitialized;
    void runInInjectionContext(injector, () =>
        utils.enforceLoginGuard(
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

for (const loggedIn of [false, true]) {
    test(`injectOidc and getOidc assert authentication, loggedIn=${loggedIn}`, async () => {
        const core = resetCore();
        core.loggedIn = loggedIn;
        const utils = oidcSpa.withUser({ createUser: () => "Alice" }).createUtils();
        const { injector, initialization } = app([utils.provideOidc(params)]);
        assert.throws(
            () => runInInjectionContext(injector, () => utils.injectOidc({ assert: "user logged in" })),
            /before core authentication is ready/
        );
        core.ready.resolve();
        await initialization.donePromise;
        const correct = loggedIn ? "user logged in" : "user not logged in";
        const wrong = loggedIn ? "user not logged in" : "user logged in";
        // The assertion is selected dynamically only in this test.
        assert.equal(
            runInInjectionContext(injector, () =>
                utils.injectOidc({ assert: correct as "user logged in" })
            ).isUserLoggedIn,
            loggedIn
        );
        assert.throws(
            () =>
                runInInjectionContext(injector, () =>
                    utils.injectOidc({ assert: wrong as "user logged in" })
                ),
            /Called injectOidc/
        );
        assert.equal(
            (await utils.getOidc({ assert: correct as "user logged in" })).isUserLoggedIn,
            loggedIn
        );
        await assert.rejects(utils.getOidc({ assert: wrong as "user logged in" }), /Called getOidc/);
        assert.throws(() => utils.injectOidc(), /injection context/);
        if (loggedIn) {
            const oidc = runInInjectionContext(injector, () =>
                utils.injectOidc({ assert: "user logged in" })
            );
            assert.equal(oidc.user(), "Alice");
            assert.equal(oidc.user(), oidc.user());
            assert.equal("user$" in oidc, false);
            assert.equal("$user" in oidc, false);
        }
    });
}

test("getOidc can wait before provideOidc and resolve inside createUser before UI readiness", async () => {
    const core = resetCore();
    const utils = oidcSpa
        .withUser<string>({
            createUser: async (): Promise<string> => {
                const oidc = await utils.getOidc({ assert: "user logged in" });
                return `User with ${await oidc.getAccessToken()}`;
            }
        })
        .createUtils();
    let settled = false;
    const pending = utils.getOidc({ assert: "user logged in" });
    void pending.then(() => {
        settled = true;
    });
    await tick();
    assert.equal(settled, false);
    const { injector, initialization } = app([utils.provideOidc(params)]);
    core.ready.resolve();
    const imperative = await pending;
    assert.equal(await imperative.getAccessToken(), "access-token-1");
    await initialization.donePromise;
    assert.equal(
        runInInjectionContext(injector, () => utils.injectOidc({ assert: "user logged in" })).user(),
        "User with access-token-1"
    );
});

test("getOidc reaches tokens while the asynchronous user is still pending", async () => {
    const core = resetCore();
    let resolveUser!: (user: string) => void;
    const utils = oidcSpa
        .withUser({
            createUser: () =>
                new Promise<string>(resolve => {
                    resolveUser = resolve;
                })
        })
        .createUtils();
    const { injector, initialization } = app([utils.provideOidc(params)]);
    const oidc = runInInjectionContext(injector, () => utils.injectOidc());
    core.ready.resolve();
    const imperative = await utils.getOidc({ assert: "user logged in" });
    assert.equal(await imperative.getAccessToken(), "access-token-1");
    assert.equal(initialization.done, false);
    assert.throws(() => oidc.user!(), /before oidc.prInitialized resolved/);
    resolveUser("Alice");
    await initialization.donePromise;
    assert.equal(oidc.user!(), "Alice");
});

test("imperative subscriptions match the signal and detach on unsubscribe or injector destruction", async () => {
    const core = resetCore();
    const utils = oidcSpa.createUtils();
    const { injector, initialization } = app([
        utils.provideOidc({ ...params, warnUserSecondsBeforeAutoLogout: 10 })
    ]);
    core.ready.resolve();
    await initialization.donePromise;
    const imperative = await utils.getOidc({ assert: "user logged in" });
    const oidc = runInInjectionContext(injector, () => utils.injectOidc());
    const states: unknown[] = [];
    const { unsubscribeFromAutoLogoutState } = imperative.subscribeToAutoLogoutState(state => {
        assert.equal(oidc.autoLogoutState(), state);
        states.push(state);
    });
    const rotations: string[] = [];
    const { unsubscribeFromAccessTokenRotation } = imperative.subscribeToAccessTokenRotation(token =>
        rotations.push(token)
    );
    const countdown = [...core.countdownListeners][0];
    countdown({ secondsLeft: 11 });
    assert.equal(states.length, 1);
    countdown({ secondsLeft: 10 });
    assert.deepEqual(states[1], { shouldDisplayWarning: true, secondsLeftBeforeAutoLogout: 10 });
    assert.equal(states[1], oidc.autoLogoutState());
    core.rotate();
    assert.deepEqual(rotations, ["access-token-2"]);
    unsubscribeFromAccessTokenRotation();
    unsubscribeFromAccessTokenRotation();
    unsubscribeFromAutoLogoutState();
    countdown({ secondsLeft: undefined });
    assert.equal(states.length, 2);
    assert.equal(core.tokenListeners.size, 0);
    imperative.subscribeToAccessTokenRotation(() => {});
    injector.destroy();
    assert.equal(core.tokenListeners.size, 0);
    assert.equal(core.countdownListeners.size, 0);
});

test("auto-login retains HTTP interceptors and injectable user construction", async () => {
    const core = resetCore();
    const utils = oidcSpa
        .withAutoLogin()
        .withUser({
            createUser: () => firstValueFrom(inject(API).getUser())
        })
        .createUtils();
    assert.equal("enforceLoginGuard" in utils, false);
    const { injector, initialization } = app([
        utils.provideOidc(params),
        provideHttpClient(
            withInterceptors([
                utils.createOidcInterceptor({
                    shouldInjectAccessToken: req => predicate(utils.injectOidc(), req)
                })
            ])
        ),
        provideHttpClientTesting()
    ]);
    core.ready.resolve();
    await tick();
    const testing = injector.get(HttpTestingController);
    const request = testing.expectOne("/api/user");
    assert.equal(request.request.headers.get("Authorization"), "Bearer access-token-1");
    request.flush({ displayName: "Alice" });
    await initialization.donePromise;
    assert.equal(runInInjectionContext(injector, utils.injectOidc).user().displayName, "Alice");
    testing.verify();
});

test("injected login respects doesCurrentHrefRequiresAuth, defaulting to false", async () => {
    const core = resetCore();
    core.loggedIn = false;
    const utils = oidcSpa.createUtils();
    const { injector, initialization } = app([utils.provideOidc(params)]);
    core.ready.resolve();
    await initialization.donePromise;
    const oidc = runInInjectionContext(injector, () =>
        utils.injectOidc({ assert: "user not logged in" })
    );
    void oidc.login();
    await tick();
    assert.equal(core.loginParams?.doesCurrentHrefRequiresAuth, false);
    void oidc.login({ doesCurrentHrefRequiresAuth: true, redirectUrl: "/protected" });
    await tick();
    assert.deepEqual(core.loginParams, { doesCurrentHrefRequiresAuth: true, redirectUrl: "/protected" });
});

test("one active app per utilities, with reuse after injector destruction", async () => {
    const utils = oidcSpa.withUser({ createUser: () => "real", user_mock: "first" }).createUtils();
    const first = app([utils.provideOidc({ implementation: "mock", isUserInitiallyLoggedIn: true })]);
    await first.initialization.donePromise;
    assert.throws(
        () => app([utils.provideOidc({ implementation: "mock", isUserInitiallyLoggedIn: true })]),
        /one active application injector/
    );
    first.injector.destroy();
    const pending = utils.getOidc({ assert: "user logged in" });
    const third = app([
        utils.provideOidc({ implementation: "mock", isUserInitiallyLoggedIn: true, user_mock: "third" })
    ]);
    await third.initialization.donePromise;
    assert.equal((await (await pending).getUser()).user, "third");
});

test("without auto-login, authentication failure remains a logged-out result", async () => {
    const core = resetCore();
    core.error = new OidcInitializationError({
        messageOrCause: "issuer unavailable",
        isAuthServerLikelyDown: true
    });
    let builds = 0;
    const utils = oidcSpa
        .withUser({
            createUser: () => {
                builds++;
                return "Alice";
            }
        })
        .createUtils();
    const { injector, initialization } = app([utils.provideOidc(params)]);
    core.ready.resolve();
    await initialization.donePromise;
    const oidc = runInInjectionContext(injector, () =>
        utils.injectOidc({ assert: "user not logged in" })
    );
    assert.equal(oidc.initializationError, core.error);
    assert.equal(oidc.isUserLoggedIn, false);
    const imperative = await utils.getOidc({ assert: "user not logged in" });
    assert.equal(imperative.initializationError, core.error);
    assert.equal(builds, 0);
});

test("getOidc stays pending on core auto-login failure, matching React's escape hatch", async () => {
    const core = resetCore();
    core.error = new OidcInitializationError({
        messageOrCause: "issuer unavailable",
        isAuthServerLikelyDown: true
    });
    const utils = oidcSpa.withAutoLogin().createUtils();
    let settled = false;
    void utils.getOidc().then(() => {
        settled = true;
    });
    const { injector, initialization } = app([utils.provideOidc(params)]);
    core.ready.resolve();
    await initialization.donePromise;
    await tick();
    assert.equal(settled, false);
    assert.equal(runInInjectionContext(injector, utils.injectOidc).initializationError, core.error);
});

for (const nonBlocking of [false, true]) {
    for (const autoLogin of [false, true]) {
        test(`SSR injection defers authentication, nonBlocking=${nonBlocking}, autoLogin=${autoLogin}`, async () => {
            const core = resetCore();
            let userCalls = 0;
            const base = oidcSpa.withUser({
                createUser: () => {
                    userCalls++;
                    return { name: "Alice" };
                }
            });
            const builder = nonBlocking ? base.withNonBlockingRendering() : base;
            const utils = (autoLogin ? builder.withAutoLogin() : builder).createUtils();
            const { injector, initialization } = app([
                utils.provideOidc(params),
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
            assert.equal(core.calls, 0);
            assert.equal(userCalls, 0);
            assert.throws(() => oidc.isUserLoggedIn, /before core authentication is ready/);
            assert.throws(() => oidc.initializationError, /before oidc.prInitialized resolved/);
            assert.throws(() => oidc.user!(), /before oidc.prInitialized resolved/);
        });
    }
}

test("SSR requests have separate pending state and do not capture or release the active browser runtime", async () => {
    const utils = oidcSpa
        .withNonBlockingRendering()
        .withUser({ createUser: () => "Alice" })
        .createUtils();
    const browser = app([
        utils.provideOidc({ implementation: "mock", isUserInitiallyLoggedIn: true, user_mock: "Alice" })
    ]);
    const imperative = await utils.getOidc({ assert: "user logged in" });
    assert.equal((await imperative.getUser()).user, "Alice");
    const serverRequests = [0, 1].map(() =>
        app([
            utils.provideOidc({
                implementation: "mock",
                isUserInitiallyLoggedIn: true,
                user_mock: "server"
            }),
            { provide: PLATFORM_ID, useValue: "server" }
        ])
    );
    const serverOidcs = serverRequests.map(({ injector }) =>
        runInInjectionContext(injector, () => utils.injectOidc())
    );
    assert.notEqual(serverOidcs[0], serverOidcs[1]);
    assert.notEqual(serverOidcs[0].prInitialized, serverOidcs[1].prInitialized);
    for (const { injector, initialization } of serverRequests) {
        await initialization.donePromise;
        for (const injectWithAssertion of [
            () => utils.injectOidc({ assert: "user logged in" }),
            () => utils.injectOidc({ assert: "user not logged in" })
        ]) {
            assert.throws(
                () => runInInjectionContext(injector, () => injectWithAssertion()),
                /before core authentication is ready/
            );
        }
        injector.destroy();
    }
    assert.equal((await (await utils.getOidc({ assert: "user logged in" })).getUser()).user, "Alice");
    await runInInjectionContext(browser.injector, () => utils.injectOidc()).prInitialized;
});

test("SSR guard rejects promptly with client-rendering instructions", { timeout: 1000 }, async () => {
    const utils = oidcSpa.createUtils();
    const { injector, initialization } = app([
        utils.provideOidc(params),
        { provide: PLATFORM_ID, useValue: "server" }
    ]);
    await initialization.donePromise;
    // No Router is needed: the SSR diagnostic must precede navigation or waiting for OIDC.
    await assert.rejects(
        runInInjectionContext(injector, () => utils.enforceLoginGuard({} as ActivatedRouteSnapshot)),
        /enforceLoginGuard.*renderMode: RenderMode.Client.*app.routes.server.ts/
    );
});

test("imperative getOidc rejects outside the browser", async () => {
    const utils = oidcSpa.createUtils();
    const { injector, initialization } = app([
        utils.provideOidc(params),
        { provide: PLATFORM_ID, useValue: "server" }
    ]);
    await initialization.donePromise;
    assert.ok(
        runInInjectionContext(injector, () => utils.injectOidc()).prInitialized instanceof Promise
    );
    const previousWindow = globalThis.window;
    Reflect.deleteProperty(globalThis, "window");
    try {
        await assert.rejects(utils.getOidc(), /cannot be used on the server/);
    } finally {
        globalThis.window = previousWindow;
    }
});
