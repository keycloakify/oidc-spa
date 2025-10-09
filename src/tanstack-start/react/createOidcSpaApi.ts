import type {
    CreateValidateAndGetAccessTokenClaims,
    OidcSpaApi,
    UseOidc,
    ParamsOfBootstrap
} from "./types";
import type { ZodSchemaLike } from "../../tools/ZodSchemaLike";
import type { Oidc as Oidc_core } from "../../core";
import { OidcInitializationError } from "../../core/OidcInitializationError";
import { Deferred } from "../../tools/Deferred";
import { isBrowser } from "../../tools/isBrowser";
import { assert } from "../../tools/tsafe/assert";
import { infer_import_meta_env_BASE_URL } from "../../tools/infer_import_meta_env_BASE_URL";
import { createObjectThatThrowsIfAccessed } from "../../tools/createObjectThatThrowsIfAccessed";

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

    const dBootstrapResult = new Deferred<{
        paramsOfBootstrap: ParamsOfBootstrap<AutoLogin, DecodedIdToken, AccessTokenClaims>;
        // NOTE:
        // undefined means we're running on the server
        // initializationError means autoLogin and init error
        // oidcCore means we are on the browser and autoLogin without error or not autoLogin.
        oidcCoreOrInitializationError: Oidc_core<DecodedIdToken> | OidcInitializationError | undefined;
    }>();

    let hasBootstrapBeenCalled = false;

    const bootstrapOidc = (
        paramsOfBootstrap: ParamsOfBootstrap<AutoLogin, DecodedIdToken, AccessTokenClaims>
    ) => {
        if (hasBootstrapBeenCalled) {
            return;
        }

        hasBootstrapBeenCalled = true;

        if (isBrowser) {
            dBootstrapResult.resolve({
                paramsOfBootstrap,
                oidcCoreOrInitializationError: undefined
            });
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

                        dBootstrapResult.resolve({
                            paramsOfBootstrap,
                            oidcCoreOrInitializationError: oidcCore
                        });
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
                            dBootstrapResult.resolve({
                                paramsOfBootstrap,
                                oidcCoreOrInitializationError: error
                            });
                            return;
                        }

                        dBootstrapResult.resolve({
                            paramsOfBootstrap,
                            oidcCoreOrInitializationError
                        });
                    }
                    break;
            }
        })();
    };
}
