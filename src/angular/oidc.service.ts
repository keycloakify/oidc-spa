import { BehaviorSubject } from "rxjs";
import { type Oidc, OidcInitializationError } from "../core";
import { Deferred } from "../tools/Deferred";
import { assert } from "../vendor/frontend/tsafe";
import { createObjectThatThrowsIfAccessed } from "../tools/createObjectThatThrowsIfAccessed";
import { type Signal, inject } from "@angular/core";
import { toSignal } from "@angular/core/rxjs-interop";
import type { ReadonlyBehaviorSubject } from "../tools/ReadonlyBehaviorSubject";
import { Router, type ActivatedRouteSnapshot } from "@angular/router";

export abstract class OidcService<
    T_DecodedIdToken extends Record<string, unknown> = Oidc.Tokens.DecodedIdToken_base
> {
    abstract decodedIdTokenSchema?: { parse: (x: unknown) => T_DecodedIdToken } | undefined;

    #dState = new Deferred<{
        oidc: Oidc<T_DecodedIdToken> | undefined;
        initializationError: OidcInitializationError | undefined;
    }>();

    get prInitialized(): Promise<void> {
        return this.#dState.pr.then(() => undefined);
    }

    __initialize(params: {
        prOidcOrInitializationError: Promise<Oidc<T_DecodedIdToken> | OidcInitializationError>;
    }): void {
        const { prOidcOrInitializationError } = params;

        prOidcOrInitializationError.then(oidcOrInitializationError => {
            let initializationError: OidcInitializationError | undefined = undefined;
            let oidc: Oidc<T_DecodedIdToken> | undefined = undefined;

            if (oidcOrInitializationError instanceof OidcInitializationError) {
                initializationError = oidcOrInitializationError;
            } else {
                oidc = oidcOrInitializationError;
                initializationError = oidc.isUserLoggedIn ? undefined : oidc.initializationError;
            }

            this.#dState.resolve({
                oidc,
                initializationError
            });
        });
    }

    #getState(params: { callerName: string }) {
        const { callerName } = params;
        const { hasResolved, value } = this.#dState.getState();
        if (!hasResolved) {
            throw new Error(
                [
                    `oidc-spa: ${callerName} called before`,
                    "`oidc.prInitialized` resolved.",
                    "You are using `awaitInitialization: false`.",
                    "Await `oidc.prInitialized` before using synchronous members",
                    "of oidc."
                ].join(" ")
            );
        }
        return value;
    }

    get initializationError(): OidcInitializationError | undefined {
        const state = this.#getState({ callerName: "initializationError" });
        return state.initializationError;
    }

    #getOidc(params: { callerName: string }) {
        const { callerName } = params;
        const state = this.#getState({ callerName });
        if (state.oidc === undefined) {
            // initialization failed
            assert(state.initializationError !== undefined);
            throw new Error(
                [
                    `oidc-spa: ${callerName} was accessed but initialization failed.`,
                    "You are using `autoLogin: true`, so there is no anonymous state.",
                    "Handle this by gating your UI:",
                    "if (oidc.initializationError) show an error/fallback."
                ].join(" ")
            );
        }
        return state.oidc;
    }

    get issuerUri() {
        return this.#getOidc({ callerName: "issuerUri" }).params.issuerUri;
    }

    get clientId() {
        return this.#getOidc({ callerName: "clientId" }).params.clientId;
    }

    get isUserLoggedIn() {
        return this.#getOidc({ callerName: "isUserLoggedIn" }).isUserLoggedIn;
    }

    async login(params?: {
        /**
         * Add extra query parameters to the url before redirecting to the login pages.
         */
        extraQueryParams?: Record<string, string | undefined>;
        /**
         * Where to redirect after successful login.
         * Default: window.location.href (here)
         *
         * It does not need to include the origin, eg: "/dashboard"
         */
        redirectUrl?: string;

        /**
         * Transform the url before redirecting to the login pages.
         * Prefer using the extraQueryParams parameter if you're only adding query parameters.
         */
        transformUrlBeforeRedirect?: (url: string) => string;
    }): Promise<never> {
        await this.prInitialized;

        const oidc = this.#getOidc({ callerName: "login" });

        if (oidc.isUserLoggedIn) {
            throw new Error(
                [
                    "oidc-spa: login() called but the user is already logged in.",
                    "If you wish to send the user to the login page for some update",
                    "use oidc.goToAuthServer() instead"
                ].join(" ")
            );
        }

        return oidc.login({
            ...params,
            doesCurrentHrefRequiresAuth: false
        });
    }

    async renewTokens(params?: {
        extraTokenParams?: Record<string, string | undefined>;
    }): Promise<void> {
        await this.prInitialized;

        const oidc = this.#getOidc({ callerName: "renewTokens" });

        if (!oidc.isUserLoggedIn) {
            throw new Error("oidc-spa: renewTokens() called but the user is not logged in.");
        }

        return oidc.renewTokens(params);
    }

    async logout(
        params: { redirectTo: "home" | "current page" } | { redirectTo: "specific url"; url: string }
    ): Promise<never> {
        await this.prInitialized;

        const oidc = this.#getOidc({ callerName: "logout" });

        if (!oidc.isUserLoggedIn) {
            throw new Error("oidc-spa: logout() called but the user is not logged in.");
        }

        return oidc.logout(params);
    }

    async goToAuthServer(params: {
        extraQueryParams?: Record<string, string | undefined>;
        redirectUrl?: string;
        transformUrlBeforeRedirect?: (url: string) => string;
    }): Promise<never> {
        await this.prInitialized;

        const oidc = this.#getOidc({ callerName: "goToAuthServer" });

        if (!oidc.isUserLoggedIn) {
            throw new Error("oidc-spa: goToAuthServer() called but the user is not logged in.");
        }

        return oidc.goToAuthServer(params);
    }

    #decodedIdToken$: BehaviorSubject<T_DecodedIdToken> | undefined = undefined;
    get decodedIdToken$(): ReadonlyBehaviorSubject<T_DecodedIdToken> {
        if (this.#decodedIdToken$ !== undefined) {
            return this.#decodedIdToken$;
        }

        const oidc = this.#getOidc({ callerName: "decodedIdToken$" });

        const decodedIdToken$ = new BehaviorSubject<T_DecodedIdToken>(
            (() => {
                if (!oidc.isUserLoggedIn) {
                    return createObjectThatThrowsIfAccessed({
                        debugMessage: [
                            `oidc-spa: Trying to read properties of decodedIdToken, the user`,
                            `isn't currently logged in, this does not make sense.`,
                            `You are responsible for controlling the flow of your app and`,
                            `not try to read the decodedIdToken when oidc.isUserLoggedIn is false.`
                        ].join(" ")
                    });
                }

                return oidc.getDecodedIdToken();
            })()
        );

        if (oidc.isUserLoggedIn) {
            oidc.subscribeToTokensChange(() => {
                const value_new = oidc.getDecodedIdToken();
                const value_current = decodedIdToken$.getValue();

                if (value_new === value_current) {
                    return;
                }

                decodedIdToken$.next(value_new);
            });
        }

        return (this.#decodedIdToken$ = decodedIdToken$);
    }

    #$decodedIdToken: Signal<T_DecodedIdToken> | undefined = undefined;
    get $decodedIdToken(): Signal<T_DecodedIdToken> {
        return (this.#$decodedIdToken ??= toSignal(this.decodedIdToken$, { requireSync: true }));
    }

    async getAccessToken(): Promise<
        { isUserLoggedIn: false; accessToken?: never } | { isUserLoggedIn: true; accessToken: string }
    > {
        await this.prInitialized;

        const oidc = this.#getOidc({ callerName: "getAccessToken" });

        return oidc.isUserLoggedIn
            ? { isUserLoggedIn: true, accessToken: (await oidc.getTokens()).accessToken }
            : {
                  isUserLoggedIn: false
              };
    }

    async enforceLogin(route: ActivatedRouteSnapshot): Promise<void | never> {
        const router = inject(Router);

        await this.prInitialized;

        const oidc = this.#getOidc({ callerName: "canActivateFn" });

        if (!oidc.isUserLoggedIn) {
            const redirectUrl = router.serializeUrl(
                router.createUrlTree(
                    route.url.map(u => u.path),
                    {
                        queryParams: route.queryParams,
                        fragment: route.fragment ?? undefined
                    }
                )
            );

            const doesCurrentHrefRequiresAuth =
                location.href.replace(/\/$/, "") === redirectUrl.replace(/\/$/, "");

            await oidc.login({
                doesCurrentHrefRequiresAuth,
                redirectUrl
            });
        }
    }

    #map_$secondsLeftBeforeAutoLogoutByWarningDurationSeconds = new Map<number, Signal<number | null>>();
    get$secondsLeftBeforeAutoLogout(params: { warningDurationSeconds: number }): Signal<number | null> {
        const { warningDurationSeconds } = params;

        {
            const $secondsLeftBeforeAutoLogout =
                this.#map_$secondsLeftBeforeAutoLogoutByWarningDurationSeconds.get(
                    warningDurationSeconds
                );

            if ($secondsLeftBeforeAutoLogout !== undefined) {
                return $secondsLeftBeforeAutoLogout;
            }
        }

        const oidc = this.#getOidc({ callerName: "get$secondsLeftBeforeAutoLogout" });

        const secondsLeftBeforeAutoLogout$ = new BehaviorSubject<number | null>(null);

        if (oidc.isUserLoggedIn) {
            oidc.subscribeToAutoLogoutCountdown(({ secondsLeft }) => {
                if (secondsLeft === undefined || secondsLeft > warningDurationSeconds) {
                    if (secondsLeftBeforeAutoLogout$.getValue() !== null) {
                        secondsLeftBeforeAutoLogout$.next(null);
                    }
                    return;
                }

                secondsLeftBeforeAutoLogout$.next(secondsLeft);
            });
        }

        const $secondsLeftBeforeAutoLogout = toSignal(secondsLeftBeforeAutoLogout$, {
            requireSync: true
        });

        this.#map_$secondsLeftBeforeAutoLogoutByWarningDurationSeconds.set(
            warningDurationSeconds,
            $secondsLeftBeforeAutoLogout
        );

        return $secondsLeftBeforeAutoLogout;
    }

    get isNewBrowserSession() {
        const oidc = this.#getOidc({ callerName: "isNewBrowserSession" });

        if (!oidc.isUserLoggedIn) {
            throw new Error("oidc-spa: isNewBrowserSession was used but the used is not logged in");
        }

        return oidc.isNewBrowserSession;
    }
}
