/* eslint-disable @typescript-eslint/no-namespace */

import { useReducer } from "../tools/svelte/useReducer";
import { createOidc, OidcInitializationError, type Oidc, type ParamsOfCreateOidc } from "..";
import { Deferred } from "../tools/Deferred";
import type { ValueOrAsyncGetter } from "../tools/ValueOrAsyncGetter";
import { assert, id, type Equals, type Param0 } from "../vendor/frontend/tsafe";
import { getContext, onMount, type Component } from "svelte";
import OidcProvider from "./OidcProvider.svelte";
import type { OidcProviderProps } from "./OidcProviderProps";
import type { WithLoginEnforcedProps } from "./WithLoginEnforced";
import WithLoginEnforced from "./WithLoginEnforced.svelte";
import { oidcContextKey } from "./oidc.context";
import { updateOidcStore } from "./oidc.store";
import { get, type Readable } from "svelte/store";

export type OidcSvelte<DecodedIdToken extends Record<string, unknown>> =
    | OidcSvelte.NotLoggedIn
    | OidcSvelte.LoggedIn<DecodedIdToken>;

export namespace OidcSvelte {
    export type Common = Oidc.Common;

    export type NotLoggedIn = Common & {
        isUserLoggedIn: false;
        login: (params?: {
            extraQueryParams?: Record<string, string | undefined>;
            redirectUrl?: string;
            transformUrlBeforeRedirect?: (url: string) => string;
            doesCurrentHrefRequiresAuth?: boolean;
        }) => Promise<never>;
        initializationError: OidcInitializationError | undefined;

        /** @deprecated: Use `const { decodedIdToken, tokens} = useOidc();` */
        oidcTokens?: never;
        decodedIdToken?: never;
        tokens?: never;
        logout?: never;
        subscribeToAutoLogoutCountdown?: never;
        goToAuthServer?: never;
        backFromAuthServer?: never;
        isNewBrowserSession?: never;
    };

    export type LoggedIn<DecodedIdToken extends Record<string, unknown>> = Common & {
        isUserLoggedIn: true;
        /** @deprecated: Use `const { decodedIdToken, tokens} = useOidc();` */
        oidcTokens: Oidc.Tokens<DecodedIdToken>;
        decodedIdToken: DecodedIdToken;
        tokens: Oidc.Tokens<DecodedIdToken> | undefined;
        logout: Oidc.LoggedIn["logout"];
        renewTokens: Oidc.LoggedIn["renewTokens"];
        subscribeToAutoLogoutCountdown: (
            tickCallback: (params: { secondsLeft: number | undefined }) => void
        ) => {
            unsubscribeFromAutoLogoutCountdown: () => void;
        };

        login?: never;
        initializationError?: never;
        goToAuthServer: (params: {
            extraQueryParams?: Record<string, string>;
            redirectUrl?: string;
            transformUrlBeforeRedirect?: (url: string) => string;
        }) => Promise<never>;

        backFromAuthServer:
            | {
                  extraQueryParams: Record<string, string>;
                  result: Record<string, string>;
              }
            | undefined;

        isNewBrowserSession: boolean;
    };

    export type OidcStore<DecodedIdToken extends Record<string, unknown>> =
        | Oidc<DecodedIdToken>
        | OidcInitializationError
        | undefined;

    export type Context<DecodedIdToken extends Record<string, unknown>> =
        | { oidc: Readable<Oidc<DecodedIdToken>>; fallback?: Component }
        | undefined;
}
{
    type Actual = Param0<OidcSvelte.NotLoggedIn["login"]>;
    type Expected = Omit<Param0<Oidc.NotLoggedIn["login"]>, "doesCurrentHrefRequiresAuth"> & {
        doesCurrentHrefRequiresAuth?: boolean;
    };

    assert<Equals<Actual, Expected>>();
}

type OidcSvelteApi<DecodedIdToken extends Record<string, unknown>, AutoLogin extends boolean> = {
    OidcProvider: Component<OidcProviderProps>;
    useOidc: AutoLogin extends true
        ? {
              (params?: { assert: "user logged in" }): OidcSvelte.LoggedIn<DecodedIdToken>;
          }
        : {
              (params?: { assert?: undefined }): OidcSvelte<DecodedIdToken>;
              (params: { assert: "user logged in" }): OidcSvelte.LoggedIn<DecodedIdToken>;
              (params: { assert: "user not logged in" }): OidcSvelte.NotLoggedIn;
          };
    getOidc: () => Promise<
        AutoLogin extends true ? Oidc.LoggedIn<DecodedIdToken> : Oidc<DecodedIdToken>
    >;
} & (AutoLogin extends true
    ? // eslint-disable-next-line @typescript-eslint/no-empty-object-type
      {}
    : {
          WithLoginEnforced: Component<WithLoginEnforcedProps>;
      });

export function createOidcSvelteApi_dependencyInjection<
    DecodedIdToken extends Record<string, unknown>,
    ParamsOfCreateOidc extends {
        autoLogin?: boolean;
    } & (
        | {
              decodedIdTokenSchema: { parse: (data: unknown) => DecodedIdToken } | undefined;
          }
        // eslint-disable-next-line @typescript-eslint/no-empty-object-type
        | {}
    )
>(
    paramsOrGetParams: ValueOrAsyncGetter<ParamsOfCreateOidc>,
    createOidc: (params: ParamsOfCreateOidc) => Promise<Oidc<DecodedIdToken>>
): OidcSvelteApi<
    DecodedIdToken,
    ParamsOfCreateOidc extends { autoLogin?: true | undefined } ? true : false
> {
    const dReadyToCreate = new Deferred<void>();

    // NOTE: It can be InitializationError only if autoLogin is true
    const prOidcOrInitializationError = (async () => {
        const params = await (async () => {
            if (typeof paramsOrGetParams === "function") {
                const getParams = paramsOrGetParams;

                await dReadyToCreate.pr;

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

    prOidcOrInitializationError.then(oidc => {
        updateOidcStore(oidc);
    });

    function useOidc(params?: {
        assert?: "user logged in" | "user not logged in";
    }): OidcSvelte<DecodedIdToken> {
        const { assert: assert_params } = params ?? {};

        const contextValue = getContext<OidcSvelte.Context<DecodedIdToken>>(oidcContextKey);

        assert(contextValue !== undefined, "You must use useOidc inside the corresponding OidcProvider");

        const oidc = get(contextValue.oidc);

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

        const [, forceUpdate] = useReducer<never[], Oidc.Tokens<DecodedIdToken>>(() => [], []);
        // TODO: Remove in next major version
        onMount(() => {
            if (!oidc.isUserLoggedIn) {
                return;
            }

            const { unsubscribe } = oidc.subscribeToTokensChange(forceUpdate);

            return () => unsubscribe();
        });

        const tokensState_ref: {
            isConsumerReadingTokens: boolean;
            tokens: Oidc.Tokens<DecodedIdToken> | undefined;
        } = {
            isConsumerReadingTokens: false,
            tokens: undefined
        };

        onMount(() => {
            if (!oidc.isUserLoggedIn) {
                return;
            }

            const updateTokens = (tokens: Oidc.Tokens<DecodedIdToken>) => {
                if (tokens === tokensState_ref.tokens) {
                    return;
                }

                const tokenState = tokensState_ref;

                tokenState.tokens = tokens;

                if (tokenState.isConsumerReadingTokens) {
                    forceUpdate(tokens);
                }
            };

            let isActive = true;

            oidc.getTokens_next().then(tokens => {
                if (!isActive) {
                    return;
                }
                updateTokens(tokens);
            });

            const { unsubscribe } = oidc.subscribeToTokensChange(tokens => {
                updateTokens(tokens);
            });

            return () => {
                isActive = false;
                unsubscribe();
            };
        });

        const common: OidcSvelte.Common = {
            params: oidc.params
        };

        if (!oidc.isUserLoggedIn) {
            return id<OidcSvelte.NotLoggedIn>({
                ...common,
                isUserLoggedIn: false,
                login: ({ doesCurrentHrefRequiresAuth = false, ...rest } = {}) =>
                    oidc.login({ doesCurrentHrefRequiresAuth, ...rest }),
                initializationError: oidc.initializationError
            });
        }

        const oidcSvelte: OidcSvelte.LoggedIn<DecodedIdToken> = {
            ...common,
            isUserLoggedIn: true,
            oidcTokens: oidc.getTokens(),
            decodedIdToken: oidc.getDecodedIdToken(),
            get tokens() {
                const tokensState = tokensState_ref;
                tokensState.isConsumerReadingTokens = true;
                return tokensState.tokens;
            },
            logout: oidc.logout,
            renewTokens: oidc.renewTokens,
            subscribeToAutoLogoutCountdown: oidc.subscribeToAutoLogoutCountdown,
            goToAuthServer: oidc.goToAuthServer,
            isNewBrowserSession: oidc.isNewBrowserSession,
            backFromAuthServer: oidc.backFromAuthServer
        };
        return oidcSvelte;
    }

    const prOidc = prOidcOrInitializationError.then(oidcOrInitializationError => {
        if (oidcOrInitializationError instanceof OidcInitializationError) {
            return new Promise<never>(() => {});
        }

        const oidc = oidcOrInitializationError;

        return oidc;
    });

    async function getOidc(): Promise<Oidc<DecodedIdToken>> {
        dReadyToCreate.resolve();

        // TODO: Directly return oidc in next major version
        const oidc = await prOidc;

        if (oidc.isUserLoggedIn) {
            await oidc.getTokens_next();
        }

        return oidc;
    }

    const oidcSvelte: OidcSvelteApi<DecodedIdToken, false> = {
        OidcProvider,
        // @ts-expect-error: We know what we are doing
        useOidc,
        getOidc,
        WithLoginEnforced
    };

    // @ts-expect-error: We know what we are doing
    return oidcSvelte;
}

/** @see: https://docs.oidc-spa.dev/v/v6/usage#svelte-api */
export function createSvelteOidc<
    DecodedIdToken extends Record<string, unknown> = Record<string, unknown>,
    AutoLogin extends boolean = false
>(params: ValueOrAsyncGetter<ParamsOfCreateOidc<DecodedIdToken, AutoLogin>>) {
    return createOidcSvelteApi_dependencyInjection(params, createOidc);
}
