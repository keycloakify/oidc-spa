import { isPlatformBrowser } from "@angular/common";
import {
    inject,
    InjectionToken,
    Injector,
    makeEnvironmentProviders,
    PLATFORM_ID,
    provideAppInitializer,
    runInInjectionContext
} from "@angular/core";
import type { HttpInterceptorFn } from "@angular/common/http";
import { Router } from "@angular/router";
import { defer, finalize, from, switchMap } from "rxjs";
import { setDesiredPostLoginRedirectUrl } from "../core/desiredPostLoginRedirectUrl";
import { toFullyQualifiedUrl } from "../tools/toFullyQualifiedUrl";
import type { BuilderParams } from "./utilsBuilder";
import type { OidcService, OidcSpaUtils, OidcHelpers } from "./types";
import { createOidcService, type InitializationParams } from "./createOidcService";

export function createOidcSpaUtils<AutoLogin extends boolean, User>(
    builder: BuilderParams<AutoLogin, User>
): OidcSpaUtils<AutoLogin, User> {
    type Runtime = ReturnType<typeof createOidcService<User>>;
    const runtimeToken = new InjectionToken<Runtime>("oidc-spa runtime");
    const token = new InjectionToken<OidcService<AutoLogin, User>>("Oidc");

    function provide(initialization: InitializationParams<User>) {
        return makeEnvironmentProviders([
            { provide: runtimeToken, useFactory: () => createOidcService(builder) },
            { provide: token, useFactory: () => inject(runtimeToken).oidc },
            provideAppInitializer(() => {
                if (!isPlatformBrowser(inject(PLATFORM_ID))) {
                    return;
                }
                const runtime = inject(runtimeToken);
                const prInitialized = runtime.initialize(initialization);
                return builder.providerAwaitsInitialization ? prInitialized : undefined;
            })
        ]);
    }

    const helpers: OidcHelpers<AutoLogin, User> = {
        provide: params => provide({ implementation: "real", params }),
        provideMock: (params = {}) => provide({ implementation: "mock", params }),
        createBearerInterceptor: ({ shouldInjectAccessToken }) => {
            const interceptor: HttpInterceptorFn = (req, next) => {
                const runtime = inject(runtimeToken);
                const injector = inject(Injector);

                const evaluate = () =>
                    runInInjectionContext(injector, () =>
                        runtime.evaluateInterceptor(() => shouldInjectAccessToken(req))
                    );

                let decision: boolean | undefined;
                try {
                    decision = evaluate();
                } catch (error) {
                    if (error !== runtime.prCore) {
                        throw error;
                    }
                }

                // In particular, allow the HTTP request that loads runtime configuration through.
                if (decision === false) {
                    return next(req);
                }

                return defer(() => {
                    const timer = setTimeout(() => {
                        if (!runtime.isRunningGetParams) {
                            return;
                        }
                        console.warn(
                            `oidc-spa: Probable deadlock: ${req.method} ${req.urlWithParams} is waiting for authentication ` +
                                "while Oidc.provide's configuration is loading. Requests used to load that configuration " +
                                "must return false from shouldInjectAccessToken before reading authentication state."
                        );
                    }, 4_000);

                    return from(runtime.prCore).pipe(
                        switchMap(() => {
                            if (!(decision ?? evaluate())) {
                                return next(req);
                            }
                            return from(runtime.oidc.getAccessToken()).pipe(
                                switchMap(result => {
                                    if (!result.isUserLoggedIn) {
                                        throw new Error(
                                            `oidc-spa: Attempted to attach an access token to ${req.method} ${req.urlWithParams}, ` +
                                                "but the user is not logged in."
                                        );
                                    }
                                    return next(
                                        req.clone({
                                            setHeaders: {
                                                Authorization: `Bearer ${result.accessToken}`
                                            }
                                        })
                                    );
                                })
                            );
                        }),
                        finalize(() => clearTimeout(timer))
                    );
                });
            };
            return interceptor;
        },
        enforceLoginGuard: async (route, state) => {
            const runtime = inject(runtimeToken);
            const router = inject(Router);
            if (!isPlatformBrowser(inject(PLATFORM_ID))) {
                throw new Error("oidc-spa: enforceLoginGuard cannot be used on the server.");
            }

            await runtime.oidc.prInitialized;
            const core = runtime.getCore("enforceLoginGuard");
            // An initial user-build error must not let a protected component render with no User.
            if (core.isUserLoggedIn && runtime.oidc.initializationError !== undefined) {
                throw runtime.oidc.initializationError;
            }

            const redirectUrl = toFullyQualifiedUrl({
                urlish:
                    state?.url ??
                    router.serializeUrl(
                        router.createUrlTree(
                            route.pathFromRoot.flatMap(snapshot =>
                                snapshot.url.map(segment => segment.path)
                            ),
                            { queryParams: route.queryParams, fragment: route.fragment ?? undefined }
                        )
                    ),
                doAssertNoQueryParams: false
            });
            const isUrlAlreadyReplaced =
                window.location.href.replace(/\/$/, "") === redirectUrl.replace(/\/$/, "");

            if (!core.isUserLoggedIn) {
                await core.login({ doesCurrentHrefRequiresAuth: isUrlAlreadyReplaced, redirectUrl });
            }

            if (!isUrlAlreadyReplaced) {
                setDesiredPostLoginRedirectUrl({ postLoginRedirectUrl: redirectUrl });
                const history_pushState = history.pushState;
                const history_replaceState = history.replaceState;
                const onNavigated = () => {
                    history.pushState = history_pushState;
                    history.replaceState = history_replaceState;
                    setDesiredPostLoginRedirectUrl({ postLoginRedirectUrl: undefined });
                };
                history.pushState = function (...args) {
                    onNavigated();
                    return history_pushState.apply(this, args);
                };
                history.replaceState = function (...args) {
                    onNavigated();
                    return history_replaceState.apply(this, args);
                };
            }
            return true;
        }
    };

    // Augmenting InjectionToken<T> loses Angular's inference because T is phantom.
    // AbstractType<T> preserves it through its prototype property. This assertion is
    // only for inference: the runtime value remains an InjectionToken, resolved by
    // identity through useFactory above. It is never constructed or used as a prototype.
    return {
        Oidc: Object.assign(token, helpers) as unknown as OidcSpaUtils<AutoLogin, User>["Oidc"]
    };
}
