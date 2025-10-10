import { useState, useEffect } from "react";
import type {
    CreateValidateAndGetAccessTokenClaims,
    OidcSpaApi,
    UseOidc,
    ParamsOfBootstrap,
    Oidc
} from "./types";
import type { ZodSchemaLike } from "../../tools/ZodSchemaLike";
import type { Oidc as Oidc_core } from "../../core";
import { OidcInitializationError } from "../../core/OidcInitializationError";
import { Deferred } from "../../tools/Deferred";
import { isBrowser } from "../../tools/isBrowser";
import { assert, type Equals } from "../../tools/tsafe/assert";
import { infer_import_meta_env_BASE_URL } from "../../tools/infer_import_meta_env_BASE_URL";
import { createObjectThatThrowsIfAccessed } from "../../tools/createObjectThatThrowsIfAccessed";
import { createStatefulEvt } from "../../tools/StatefulEvt";
import { id } from "../../tools/tsafe/id";

export function createOidcSpaApi<
    AutoLogin extends boolean,
    DecodedIdToken extends Record<string, unknown>,
    AccessTokenClaims
>(params: {
    autoLogin: AutoLogin;
    decodedIdTokenSchema:
        | ZodSchemaLike<Oidc_core.Tokens.DecodedIdToken_OidcCoreSpec, DecodedIdToken>
        | undefined;
    decodedIdToken_mock: DecodedIdToken | undefined;
    createValidateAndGetAccessTokenClaims:
        | CreateValidateAndGetAccessTokenClaims<AccessTokenClaims>
        | undefined;
}): OidcSpaApi<AutoLogin, DecodedIdToken, AccessTokenClaims> {
    const {
        autoLogin,
        decodedIdTokenSchema,
        decodedIdToken_mock,
        createValidateAndGetAccessTokenClaims
    } = params;

    const dParamsOfBootstrap = new Deferred<
        ParamsOfBootstrap<AutoLogin, DecodedIdToken, AccessTokenClaims>
    >();

    const dOidcCoreOrInitializationError = new Deferred<
        Oidc_core<DecodedIdToken> | OidcInitializationError
    >();

    const evtAutoLogoutState = createStatefulEvt<Oidc.Common["autoLogoutState"]>(() => ({
        shouldDisplayWarning: false
    }));

    dOidcCoreOrInitializationError.pr.then(oidcCoreOrInitializationError => {
        const { hasResolved, value: paramsOfBootstrap } = dParamsOfBootstrap.getState();

        assert(hasResolved);

        if (paramsOfBootstrap.implementation === "mock") {
            return;
        }
        assert<Equals<typeof paramsOfBootstrap.implementation, "real">>;

        const { startCountdownSecondsBeforeAutoLogout = 45 } = paramsOfBootstrap;

        if (
            oidcCoreOrInitializationError === undefined ||
            oidcCoreOrInitializationError instanceof OidcInitializationError
        ) {
            return;
        }

        const oidcCore = oidcCoreOrInitializationError;

        if (!oidcCore.isUserLoggedIn) {
            return;
        }

        oidcCore.subscribeToAutoLogoutCountdown(({ secondsLeft }) => {
            const newState: Oidc.Common["autoLogoutState"] = (() => {
                if (secondsLeft === undefined) {
                    return {
                        shouldDisplayWarning: false
                    };
                }

                if (secondsLeft > startCountdownSecondsBeforeAutoLogout) {
                    return {
                        shouldDisplayWarning: false
                    };
                }

                return {
                    shouldDisplayWarning: true,
                    secondsLeftBeforeAutoLogout: secondsLeft
                };
            })();

            if (!newState.shouldDisplayWarning && !evtAutoLogoutState.current.shouldDisplayWarning) {
                return;
            }

            evtAutoLogoutState.current = newState;
        });
    });

    function useOidc(params?: {
        assert?: "user not logged in" | "user logged in";
    }): Oidc<DecodedIdToken> {
        const { hasResolved, value: oidcCoreOrInitializationError } =
            dOidcCoreOrInitializationError.getState();

        if (
            autoLogin &&
            (!hasResolved || oidcCoreOrInitializationError instanceof OidcInitializationError)
        ) {
            throw new Error(
                [
                    "oidc-spa: Since you have enabled autoLogin, your all app should",
                    "be wrapped into <OidcInitializationGage />"
                ].join(" ")
            );
        }

        assert(!(oidcCoreOrInitializationError instanceof OidcInitializationError));

        if (params?.assert === "user logged in") {
            if (!hasResolved || !oidcCoreOrInitializationError.isUserLoggedIn) {
                throw new Error(
                    [
                        "oidc-spa: useOidc() was called asserting the user logged in",
                        "but it's not the case.",
                        hasResolved
                            ? "The user is not logged in"
                            : [
                                  "The oidc initialization process hasn't completed yet.",
                                  "We don't know yet if the user is logged in or not at this time."
                              ].join(" "),
                        "To make sure this doesn't happen thou should either mark the route as",
                        "protected with beforeLoad: enforceLogin or control the flow or your app",
                        "making sure to only mount components that call",
                        "useOidc({ assert: 'user logged in' }) when you have previously tested that",
                        "const { isUserLoggedIn } = useOidc() is true in a parent component."
                    ].join(" ")
                );
            }
        }

        const [oidcCore, setOidcCore] = useState<Oidc_core<DecodedIdToken> | undefined>(
            params?.assert === "user logged in" ? oidcCoreOrInitializationError : undefined
        );

        useEffect(() => {
            if (hasResolved) {
                return;
            }

            dOidcCoreOrInitializationError.pr.then(oidcCore => {
                assert(!(oidcCore instanceof OidcInitializationError));

                setOidcCore(oidcCore);
            });
        }, []);

        if (
            oidcCore !== undefined &&
            oidcCore.isUserLoggedIn &&
            params?.assert === "user not logged in"
        ) {
            throw new Error(
                [
                    "oidc-spa: Used useOidc() asserting the user is NOT logged in",
                    "but it isn't the case, the user is logged in.",
                    "Make sure to only mount components that call",
                    "useOidc({ assert: 'user not logged in' }) when you have previously tested that",
                    "const { isUserLoggedIn } = useOidc() is falsish in a parent component."
                ].join(" ")
            );
        }

        const common: Oidc.Common = {
            params: {
                issuerUri
            },
            autoLogoutState: evtAutoLogoutState.current
        };

        if (oidcCore === undefined) {
            return id<Oidc.NotLoggedIn>({});
        }
    }

    let hasBootstrapBeenCalled = false;

    const bootstrapOidc = (
        paramsOfBootstrap: ParamsOfBootstrap<AutoLogin, DecodedIdToken, AccessTokenClaims>
    ) => {
        if (hasBootstrapBeenCalled) {
            return;
        }

        hasBootstrapBeenCalled = true;

        dParamsOfBootstrap.resolve(paramsOfBootstrap);

        if (isBrowser) {
            return;
        }

        (async () => {
            switch (paramsOfBootstrap.implementation) {
                case "mock":
                    {
                        const { createMockOidc } = await import("../../mock/oidc");

                        const oidcCore = await createMockOidc({
                            homeUrl: infer_import_meta_env_BASE_URL(),
                            // NOTE: The `as false` is lying here, it's just to preserve some level of type-safety.
                            autoLogin: autoLogin as false,
                            // NOTE: Same here, the nullish coalescing is lying.
                            isUserInitiallyLoggedIn: paramsOfBootstrap.isUserInitiallyLoggedIn!,
                            mockedParams: {
                                clientId: paramsOfBootstrap.clientId_mock,
                                issuerUri: paramsOfBootstrap.issuerUri_mock
                            },
                            mockedTokens: {
                                decodedIdToken:
                                    paramsOfBootstrap.decodedIdToken_mock ??
                                    decodedIdToken_mock ??
                                    createObjectThatThrowsIfAccessed<DecodedIdToken>({
                                        debugMessage: [
                                            "oidc-spa: You didn't provide any mock for the decodedIdToken",
                                            "Either provide a default one by specifying decodedIdToken_mock",
                                            "as parameter of .withExpectedDecodedIdTokenShape() or",
                                            "specify decodedIdToken_mock when calling bootstrapOidc()"
                                        ].join(" ")
                                    })
                            }
                        });

                        dOidcCoreOrInitializationError.resolve(oidcCore);
                    }
                    break;
                case "real":
                    {
                        const { createOidc } = await import("../../core");

                        let oidcCoreOrInitializationError:
                            | Oidc_core<DecodedIdToken>
                            | OidcInitializationError;

                        try {
                            oidcCoreOrInitializationError = await createOidc({
                                homeUrl: infer_import_meta_env_BASE_URL(),
                                autoLogin,
                                decodedIdTokenSchema,
                                issuerUri: paramsOfBootstrap.issuerUri,
                                clientId: paramsOfBootstrap.clientId
                            });
                        } catch (error) {
                            assert(error instanceof OidcInitializationError);
                            dOidcCoreOrInitializationError.resolve(error);
                            return;
                        }

                        dOidcCoreOrInitializationError.resolve(oidcCoreOrInitializationError);
                    }
                    break;
            }
        })();
    };
}
