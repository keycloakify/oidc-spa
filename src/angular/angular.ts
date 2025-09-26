import { type Oidc, createOidc, type ParamsOfCreateOidc, OidcInitializationError } from "../core";
import { assert, type Equals } from "../vendor/frontend/tsafe";
import { id } from "../vendor/frontend/tsafe";
import type { ValueOrAsyncGetter } from "../tools/ValueOrAsyncGetter";
import { Deferred } from "../tools/Deferred";
import { type Signal, type EnvironmentProviders, provideAppInitializer, inject } from "@angular/core";
import { type CanActivateFn, Router } from "@angular/router";
import { toSignal } from "@angular/core/rxjs-interop";
import { BehaviorSubject } from "rxjs";
import { createObjectThatThrowsIfAccessed } from "../tools/createObjectThatThrowsIfAccessed";

export type OidcAngular = OidcAngular.NotLoggedIn | OidcAngular.LoggedIn;

export namespace OidcAngular {
    export type Common = Oidc.Common;

    export type NotLoggedIn = Common & {
        isUserLoggedIn: false;
        login: (params?: {
            extraQueryParams?: Record<string, string | undefined>;
            transformUrlBeforeRedirect?: (url: string) => string;
        }) => Promise<never>;
    };

    export type LoggedIn = Common & {
        isUserLoggedIn: true;
        logout: Oidc.LoggedIn["logout"];
        renewTokens: Oidc.LoggedIn["renewTokens"];
        goToAuthServer: Oidc.LoggedIn["goToAuthServer"];
        backFromAuthServer:
            | {
                  extraQueryParams: Record<string, string>;
                  result: Record<string, string>;
              }
            | undefined;
        isNewBrowserSession: boolean;
    };
}

type OidcAngularApi<DecodedIdToken extends Record<string, unknown>, AutoLogin extends boolean> = {
    getOidc: AutoLogin extends true
        ? {
              (params?: { assert: "user logged in" }): OidcAngular.LoggedIn;
          }
        : {
              (params?: { assert?: undefined }): OidcAngular;
              (params: { assert: "user logged in" }): OidcAngular.LoggedIn;
              (params: { assert: "user not logged in" }): OidcAngular.NotLoggedIn;
          };

    getOidcInitializationError: () => OidcInitializationError | undefined;

    get$decodedIdToken: () => Signal<DecodedIdToken>;

    get$secondsLeftBeforeAutoLogout: (params: {
        warningDurationSeconds: number;
    }) => Signal<number | undefined>;

    getTokens: () => Promise<
        | { isUserLoggedIn: false; prTokens?: never }
        | { isUserLoggedIn: true; prTokens: Promise<Oidc.Tokens<DecodedIdToken>> }
    >;

    provideOidcInitAwaiter: EnvironmentProviders;
} & (AutoLogin extends true
    ? {}
    : {
          enforceLoginGuard: CanActivateFn;
      });

export function createAngularOidc_dependencyInjection<
    DecodedIdToken extends Record<string, unknown>,
    ParamsOfCreateOidc extends {
        autoLogin?: boolean;
    } & (
        | {
              decodedIdTokenSchema: { parse: (data: unknown) => DecodedIdToken } | undefined;
          }
        | {}
    )
>(
    paramsOrGetParams: ValueOrAsyncGetter<ParamsOfCreateOidc>,
    createOidc: (params: ParamsOfCreateOidc) => Promise<Oidc<DecodedIdToken>>
): OidcAngularApi<
    DecodedIdToken,
    ParamsOfCreateOidc extends { autoLogin?: true | undefined } ? true : false
> {
    const dReadyToCreate = new Deferred<void>();

    // NOTE: It can be InitializationError only if autoLogin is true
    const prOidcOrAutoLoginInitializationError = (async () => {
        const params = await (async () => {
            await dReadyToCreate.pr;

            if (typeof paramsOrGetParams === "function") {
                const getParams = paramsOrGetParams;

                const params = await getParams();

                return params;
            }

            const params = paramsOrGetParams;

            return params;
        })();

        let oidc: Oidc<DecodedIdToken>;

        try {
            oidc = await createOidc(params);
        } catch (error) {
            if (!(error instanceof OidcInitializationError)) {
                throw error;
            }

            return error;
        }

        return oidc;
    })();

    let oidcOrAutoLoginInitializationError: Oidc<DecodedIdToken> | OidcInitializationError | undefined =
        undefined;

    prOidcOrAutoLoginInitializationError.then(value => {
        oidcOrAutoLoginInitializationError = value;
    });

    function getOidc(params?: { assert?: "user logged in" | "user not logged in" }): OidcAngular {
        const { assert: assert_params } = params ?? {};

        if (oidcOrAutoLoginInitializationError === undefined) {
            throw new Error("oidc-spa: calling getOidc() before provideOidcInitAwaiter has resolved");
        }

        if (oidcOrAutoLoginInitializationError instanceof OidcInitializationError) {
            throw new Error(
                "oidc-spa: calling getOidc() while getOidcInitializationError() is not `undefined` in autoLogin: true mode"
            );
        }

        const oidc = oidcOrAutoLoginInitializationError;

        check_assertion: {
            if (assert_params === undefined) {
                break check_assertion;
            }

            const getMessage = (v: string) =>
                [
                    "There is a logic error in the application.",
                    `If this component is mounted the user is supposed ${v}.`,
                    "An explicit assertion was made in this sense."
                ].join(" ");

            switch (assert_params) {
                case "user logged in":
                    if (!oidc.isUserLoggedIn) {
                        throw new Error(getMessage("to be logged in but currently they arn't"));
                    }
                    break;
                case "user not logged in":
                    if (oidc.isUserLoggedIn) {
                        throw new Error(getMessage("not to be logged in but currently they are"));
                    }
                    break;
                default:
                    assert<Equals<typeof assert_params, never>>(false);
            }
        }

        const common: OidcAngular.Common = {
            params: oidc.params
        };

        return oidc.isUserLoggedIn
            ? id<OidcAngular.LoggedIn>({
                  ...common,
                  isUserLoggedIn: true,
                  logout: oidc.logout,
                  renewTokens: oidc.renewTokens,
                  goToAuthServer: oidc.goToAuthServer,
                  backFromAuthServer: oidc.backFromAuthServer,
                  isNewBrowserSession: oidc.isNewBrowserSession
              })
            : id<OidcAngular.NotLoggedIn>({
                  ...common,
                  isUserLoggedIn: false,
                  login: params =>
                      oidc.login({
                          ...params,
                          doesCurrentHrefRequiresAuth: false
                      })
              });
    }

    function getOidcInitializationError(): OidcInitializationError | undefined {
        if (oidcOrAutoLoginInitializationError === undefined) {
            throw new Error(
                "oidc-spa: calling getOidcInitializationError() before provideOidcInitAwaiter has resolved"
            );
        }

        if (oidcOrAutoLoginInitializationError instanceof OidcInitializationError) {
            return oidcOrAutoLoginInitializationError;
        }

        const oidc = oidcOrAutoLoginInitializationError;

        if (!oidc.isUserLoggedIn && oidc.initializationError !== undefined) {
            return oidc.initializationError;
        }

        return undefined;
    }

    const { get$decodedIdToken } = (() => {
        function createDecodedIdToken$() {
            if (oidcOrAutoLoginInitializationError === undefined) {
                throw new Error(
                    "oidc-spa: calling get$decodedIdToken() before provideOidcInitAwaiter has resolved"
                );
            }

            if (oidcOrAutoLoginInitializationError instanceof OidcInitializationError) {
                throw new Error(
                    "oidc-spa: calling getOidc() while getOidcInitializationError() is not `undefined` in autoLogin: true mode"
                );
            }

            const oidc = oidcOrAutoLoginInitializationError;

            let initialValue: DecodedIdToken;

            if (!oidc.isUserLoggedIn) {
                initialValue = createObjectThatThrowsIfAccessed({
                    debugMessage: [
                        "You are trying to read the decodedIdToken but the user",
                        "isn't logged in"
                    ].join(" ")
                });
            } else {
                initialValue = oidc.getDecodedIdToken();
            }

            const decodedIdToken$ = new BehaviorSubject<DecodedIdToken>(initialValue);

            if (oidc.isUserLoggedIn) {
                oidc.subscribeToTokensChange(() => {
                    const decodedIdToken = oidc.getDecodedIdToken();

                    if (decodedIdToken$.getValue() === decodedIdToken) {
                        return;
                    }

                    decodedIdToken$.next(decodedIdToken);
                });
            }

            return decodedIdToken$;
        }

        let decodedIdToken$: BehaviorSubject<DecodedIdToken> | undefined = undefined;

        function get$decodedIdToken(): Signal<DecodedIdToken> {
            return toSignal((decodedIdToken$ ??= createDecodedIdToken$()), {
                requireSync: true
            });
        }

        return { get$decodedIdToken };
    })();

    const { get$secondsLeftBeforeAutoLogout } = (() => {
        function createSecondsLeftBeforeAutoLogout$() {
            if (oidcOrAutoLoginInitializationError === undefined) {
                throw new Error(
                    "oidc-spa: calling get$decodedIdToken() before provideOidcInitAwaiter has resolved"
                );
            }

            if (oidcOrAutoLoginInitializationError instanceof OidcInitializationError) {
                throw new Error(
                    "oidc-spa: calling getOidc() while getOidcInitializationError() is not `undefined` in autoLogin: true mode"
                );
            }

            const oidc = oidcOrAutoLoginInitializationError;

            const secondsLeftBeforeAutoLogout$ = new BehaviorSubject<number | undefined>(undefined);

            if (oidc.isUserLoggedIn) {
                oidc.subscribeToAutoLogoutCountdown(({ secondsLeft }) =>
                    secondsLeftBeforeAutoLogout$.next(secondsLeft)
                );
            }

            return secondsLeftBeforeAutoLogout$;
        }

        let secondsLeftBeforeAutoLogout$: BehaviorSubject<number | undefined> | undefined = undefined;

        function get$secondsLeftBeforeAutoLogout(params: {
            warningDurationSeconds: number;
        }): Signal<number | undefined> {
            const { warningDurationSeconds } = params;

            secondsLeftBeforeAutoLogout$ ??= createSecondsLeftBeforeAutoLogout$();

            const secondsLeftBeforeAutoLogout$_cropped = new BehaviorSubject<number | undefined>(
                secondsLeftBeforeAutoLogout$.getValue()
            );

            secondsLeftBeforeAutoLogout$.subscribe(secondsLeftBeforeAutoLogout => {
                if (
                    secondsLeftBeforeAutoLogout === undefined ||
                    secondsLeftBeforeAutoLogout > warningDurationSeconds
                ) {
                    if (secondsLeftBeforeAutoLogout$_cropped.getValue() !== undefined) {
                        secondsLeftBeforeAutoLogout$_cropped.next(undefined);
                    }
                    return;
                }

                secondsLeftBeforeAutoLogout$_cropped.next(secondsLeftBeforeAutoLogout);
            });

            const signal = toSignal(secondsLeftBeforeAutoLogout$_cropped, {
                requireSync: true
            });

            return signal;
        }

        return { get$secondsLeftBeforeAutoLogout };
    })();

    async function getTokens(): Promise<
        | { isUserLoggedIn: false; prTokens?: never }
        | { isUserLoggedIn: true; prTokens: Promise<Oidc.Tokens<DecodedIdToken>> }
    > {
        const oidcOrAutoLoginInitializationError = await prOidcOrAutoLoginInitializationError;

        if (oidcOrAutoLoginInitializationError instanceof OidcInitializationError) {
            return new Promise<never>(() => {});
        }

        const oidc = oidcOrAutoLoginInitializationError;

        return oidc.isUserLoggedIn
            ? { isUserLoggedIn: true, prTokens: oidc.getTokens() }
            : {
                  isUserLoggedIn: false
              };
    }

    const provideOidcInitAwaiter: EnvironmentProviders = provideAppInitializer(async () => {
        dReadyToCreate.resolve();
        await prOidcOrAutoLoginInitializationError;
    });

    const enforceLoginGuard: CanActivateFn = async route => {
        const router = inject(Router);

        const oidcOrAutoLoginInitializationError = await prOidcOrAutoLoginInitializationError;

        if (oidcOrAutoLoginInitializationError instanceof OidcInitializationError) {
            // TODO: Not the correct behavior here.
            return new Promise<never>(() => {});
        }

        const oidc = oidcOrAutoLoginInitializationError;

        if (!oidc.isUserLoggedIn) {
            const redirectUrl = (() => {
                const tree = router.createUrlTree(
                    route.url.map(u => u.path),
                    {
                        queryParams: route.queryParams
                    }
                );
                return router.serializeUrl(tree);
            })();

            const doesCurrentHrefRequiresAuth =
                location.href.replace(/\/$/, "") === redirectUrl.replace(/\/$/, "");

            await oidc.login({
                doesCurrentHrefRequiresAuth,
                redirectUrl
            });
        }

        return true;
    };

    const oidcAngularApi = id<OidcAngularApi<DecodedIdToken, false>>({
        getOidc: getOidc as any,
        getOidcInitializationError,
        get$decodedIdToken,
        get$secondsLeftBeforeAutoLogout,
        getTokens,
        provideOidcInitAwaiter,
        enforceLoginGuard
    });

    // @ts-expect-error: We know what we are doing
    return oidcAngularApi;
}

/** @see: https://docs.oidc-spa.dev/v/v8/usage#angular-api */
export function createAngularOidc<
    DecodedIdToken extends Record<string, unknown> = Oidc.Tokens.DecodedIdToken_base,
    AutoLogin extends boolean = false
>(params: ValueOrAsyncGetter<Omit<ParamsOfCreateOidc<DecodedIdToken, AutoLogin>, "homeUrl">>) {
    return createAngularOidc_dependencyInjection(params, params =>
        createOidc({
            ...params,
            homeUrl: (() => {
                const baseEl = document.querySelector<HTMLBaseElement>("base[href]");
                if (!baseEl) {
                    throw new Error('No <base href="..."> element found in the DOM');
                }
                return baseEl.getAttribute("href") ?? "/";
            })()
        })
    );
}
