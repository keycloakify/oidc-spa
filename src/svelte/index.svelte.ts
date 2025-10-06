import { mount, onMount } from "svelte";
import { derived, readonly, Writable, writable, type Readable } from "svelte/store";
import { createOidc, OidcInitializationError, ParamsOfCreateOidc, type Oidc } from "../core";
import { Deferred } from "../tools/Deferred";
import type { ValueOrAsyncGetter } from "../tools/ValueOrAsyncGetter";
import { toFullyQualifiedUrl } from "../tools/toFullyQualifiedUrl";
import type { Param0 } from "../tools/tsafe/Param0";
import { assert, type Equals } from "../tools/tsafe/assert";
import { id } from "../tools/tsafe/id";
import OidcProvider from "./OidcProvider.svelte";
import type { OidcProviderOidcProps, OidcProviderProps } from "./OidcProviderProps";
import { getOidcContext, setOidcContext } from "./oidc.context";
import OidcContextProvider from "./OidcContextProvider.svelte";

const useState = <T>(initialState: T): [Readable<T>, (newState: T) => void] => {
    const state = writable(initialState);
    const dispatch = (newState: T) => state.set(newState);
    const readableState = derived(state, $state => $state);
    return [readableState, dispatch];
};

export type OidcSvelte<DecodedIdToken extends Record<string, unknown>> =
    | OidcSvelte.NotLoggedIn
    | OidcSvelte.LoggedIn<DecodedIdToken>;

export namespace OidcSvelte {
    export type Common = Oidc.Common & {
        useAutoLogoutWarningCountdown: (params: { warningDurationSeconds: number }) => {
            secondsLeft: Readable<number | undefined>;
        };
    };
    export type NotLoggedIn = Common & {
        isUserLoggedIn: false;
        login: (params?: {
            extraQueryParams?: Record<string, string | undefined>;
            redirectUrl?: string;
            transformUrlBeforeRedirect?: (url: string) => string;
            doesCurrentHrefRequiresAuth?: boolean;
        }) => Promise<never>;
        initializationError: OidcInitializationError | undefined;

        decodedIdToken?: never;
        logout?: never;
        renewTokens?: never;
        goToAuthServer?: never;
        backFromAuthServer?: never;
        isNewBrowserSession?: never;
    };

    export type LoggedIn<DecodedIdToken extends Record<string, unknown>> = Common & {
        isUserLoggedIn: true;
        decodedIdToken: DecodedIdToken;
        logout: Oidc.LoggedIn["logout"];
        renewTokens: Oidc.LoggedIn["renewTokens"];
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
}

{
    type Actual = Param0<OidcSvelte.NotLoggedIn["login"]>;
    type Expected = Omit<Param0<Oidc.NotLoggedIn["login"]>, "doesCurrentHrefRequiresAuth"> & {
        doesCurrentHrefRequiresAuth?: boolean;
    };

    assert<Equals<Actual, Expected>>();
}

type OidcSvelteApi<DecodedIdToken extends Record<string, unknown>, AutoLogin extends boolean> = {
    /**
     * Generic initialization function that covers multi-provider and svelte-kit implementations.
     *
     * NB: If only one provider is required and the project doesn't use svelte-kit,
     * it is possible to use `mountOidc`.
     *
     */
    initializeOidc: () => {
        props: Readable<{
            oidcOrInitializationError: OidcInitializationError | Oidc<DecodedIdToken> | undefined;
        }>;
        setOidcContext: (context: { oidc: Oidc<DecodedIdToken> }) => void;
    };
    /**
     * Default Svelte component responsible to provide oidc context for its children.
     *
     * NB: it is mandatory to retrieve and to set oidcContext from `initializeOidc`.
     * It is possible to use also a custom component, see documentation.
     */
    OidcContextProvider: typeof OidcContextProvider;
    /**
     * A special version of Svelte's `mount` function that should be used to mount the root component of the application.
     * It takes the same parameters as `mount` plus an extra one for OIDC configuration.
     *
     * NB: this can be used only when having a single OIDC provider and when usign Svelte without svelte-kit.
     * For a generic initialization referes to `initializeOidc`
     *
     * @param {...Parameters<typeof mount>} params - The same parameters as Svelte's `mount` function.
     * @param {OidcProviderOidcProps<AutoLogin>} oidcProps - The OIDC configuration.
     * @returns {ReturnType<typeof mount>} The mounted component.
     */
    mountOidc: (
        ...params: [...Parameters<typeof mount>, OidcProviderOidcProps<AutoLogin>]
    ) => ReturnType<typeof mount>;
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
          enforceLogin: (loaderParams: {
              request?: { url?: string };
              cause?: "preload" | string;
              location?: {
                  href?: string;
              };
          }) => Promise<boolean>;
      });

export function createSvelteOidc_dependencyInjection<
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
): OidcSvelteApi<
    DecodedIdToken,
    ParamsOfCreateOidc extends { autoLogin?: true | undefined } ? true : false
> {
    const dReadyToCreate = new Deferred<void>();

    // NOTE: It can be InitializationError only if autoLogin is true
    const prOidcOrInitializationError = (async () => {
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

    let prOidcOrInitializationError_resolvedValue:
        | Oidc<DecodedIdToken>
        | OidcInitializationError
        | undefined = undefined;
    prOidcOrInitializationError.then(value => (prOidcOrInitializationError_resolvedValue = value));

    let oidcContextKey: symbol;

    const initializeOidc: () => {
        props: Readable<{
            oidcOrInitializationError: OidcInitializationError | Oidc<DecodedIdToken> | undefined;
        }>;
        setOidcContext: (context: { oidc: Oidc<DecodedIdToken> }) => void;
    } = () => {
        assert(
            oidcContextKey === undefined,
            "You must call initializeOidc only once per provider to initialize"
        );
        oidcContextKey = Symbol("oidc");
        const props: Writable<{
            oidcOrInitializationError: Oidc<DecodedIdToken> | OidcInitializationError | undefined;
        }> = writable({ oidcOrInitializationError: prOidcOrInitializationError_resolvedValue });
        dReadyToCreate.resolve();
        prOidcOrInitializationError.then(value => {
            props.set({ oidcOrInitializationError: value });
        });
        return {
            props: readonly(props),
            setOidcContext: (context: { oidc: Oidc<DecodedIdToken> }) =>
                setOidcContext(oidcContextKey, context)
        };
    };

    const mountOidc = (
        ...params: [
            ...Parameters<typeof mount>,
            OidcProviderOidcProps<
                ParamsOfCreateOidc extends { autoLogin?: true | undefined } ? true : false
            >
        ]
    ) => {
        const [App, options, oidcProps] = params;

        assert(oidcContextKey === undefined, "You can call mountOidc only once");
        oidcContextKey = Symbol("oidc");
        const props: OidcProviderProps<
            DecodedIdToken,
            ParamsOfCreateOidc extends { autoLogin?: true | undefined } ? true : false
        > = $state({
            App,
            oidcOrInitializationError: prOidcOrInitializationError_resolvedValue,
            oidcProps,
            appProps: options.props,
            oidcContextKey
        });
        const mounted = mount(OidcProvider, {
            ...options,
            props
        });
        dReadyToCreate.resolve();
        prOidcOrInitializationError.then(value => {
            props.oidcOrInitializationError = value;
        });
        return mounted;
    };

    const useAutoLogoutWarningCountdown: OidcSvelte.LoggedIn<DecodedIdToken>["useAutoLogoutWarningCountdown"] =
        ({ warningDurationSeconds }) => {
            assert(
                oidcContextKey !== undefined,
                "Oidc not inizitialized, you must call initializeOidc or mountOidc"
            );
            const contextValue = getOidcContext<DecodedIdToken>(oidcContextKey);

            assert(contextValue !== undefined);

            const { oidc } = contextValue;

            const [secondsLeft, setSecondsLeft] = useState<number | undefined>(undefined);

            onMount(() => {
                if (!oidc.isUserLoggedIn) {
                    return;
                }

                const { unsubscribeFromAutoLogoutCountdown } = oidc.subscribeToAutoLogoutCountdown(
                    ({ secondsLeft }) =>
                        setSecondsLeft(
                            secondsLeft === undefined || secondsLeft > warningDurationSeconds
                                ? undefined
                                : secondsLeft
                        )
                );

                return () => {
                    unsubscribeFromAutoLogoutCountdown();
                };
            });

            return { secondsLeft };
        };

    function useOidc(params?: {
        assert?: "user logged in" | "user not logged in";
    }): OidcSvelte<DecodedIdToken> {
        const { assert: assert_params } = params ?? {};

        assert(
            oidcContextKey !== undefined,
            "Oidc not initialized, you must call initializeOidc or mountOidc"
        );
        const contextValue = getOidcContext<DecodedIdToken>(oidcContextKey);

        assert(contextValue !== undefined, "You must use useOidc inside the corresponding OidcProvider");

        const { oidc } = contextValue;

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
                        throw new Error(getMessage("to be logged in but currently they aren't"));
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

        const [, reRenderIfDecodedIdTokenChanged] = useState(
            !oidc.isUserLoggedIn ? undefined : oidc.getDecodedIdToken()
        );

        onMount(() => {
            if (!oidc.isUserLoggedIn) {
                return;
            }

            const { unsubscribe } = oidc.subscribeToTokensChange(() =>
                reRenderIfDecodedIdTokenChanged(oidc.getDecodedIdToken())
            );

            reRenderIfDecodedIdTokenChanged(oidc.getDecodedIdToken());

            return () => unsubscribe();
        });

        const common: OidcSvelte.Common = {
            params: oidc.params,
            useAutoLogoutWarningCountdown
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
            decodedIdToken: oidc.getDecodedIdToken(),
            logout: oidc.logout,
            renewTokens: oidc.renewTokens,
            goToAuthServer: oidc.goToAuthServer,
            isNewBrowserSession: oidc.isNewBrowserSession,
            backFromAuthServer: oidc.backFromAuthServer
        };

        return oidcSvelte;
    }
    async function getOidc(): Promise<Oidc<DecodedIdToken>> {
        dReadyToCreate.resolve();

        const oidcOrInitializationError = await prOidcOrInitializationError;

        if (oidcOrInitializationError instanceof OidcInitializationError) {
            const error = oidcOrInitializationError;
            throw error;
        }

        const oidc = oidcOrInitializationError;

        return oidc;
    }

    async function enforceLogin(loaderParams: {
        request?: { url?: string };
        cause?: "preload" | string;
        location?: { href?: string };
    }): Promise<boolean> {
        try {
            const { cause } = loaderParams;

            const redirectUrl = (() => {
                if (loaderParams.request?.url !== undefined) {
                    return toFullyQualifiedUrl({
                        urlish: loaderParams.request.url,
                        doAssertNoQueryParams: false
                    });
                }

                if (loaderParams.location?.href !== undefined) {
                    return toFullyQualifiedUrl({
                        urlish: loaderParams.location.href,
                        doAssertNoQueryParams: false
                    });
                }

                return location.href;
            })();

            const oidc = await getOidc();

            if (!oidc.isUserLoggedIn) {
                if (cause === "preload") {
                    throw new Error(
                        "oidc-spa: User is not yet logged in. This is an expected error, nothing to be addressed."
                    );
                }
                const doesCurrentHrefRequiresAuth =
                    location.href.replace(/\/$/, "") === redirectUrl.replace(/\/$/, "");

                await oidc.login({
                    redirectUrl,
                    doesCurrentHrefRequiresAuth
                });
            }
            return true;
        } catch (error) {
            return false;
        }
    }

    const oidcSvelteApi: OidcSvelteApi<DecodedIdToken, false> = {
        initializeOidc,
        OidcContextProvider,
        mountOidc,
        useOidc: useOidc as any,
        getOidc,
        enforceLogin
    };

    // @ts-expect-error: We know what we are doing
    return oidcSvelteApi;
}

export function createSvelteOidc<
    DecodedIdToken extends Record<string, unknown> = Oidc.Tokens.DecodedIdToken_base,
    AutoLogin extends boolean = false
>(params: ValueOrAsyncGetter<ParamsOfCreateOidc<DecodedIdToken, AutoLogin>>) {
    return createSvelteOidc_dependencyInjection(params, createOidc);
}
