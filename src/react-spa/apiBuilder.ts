import type { OidcSpaApi } from "./types";
import type { Oidc as Oidc_core } from "../core";
import type { ZodSchemaLike } from "../tools/ZodSchemaLike";
import { createOidcSpaApi } from "./createOidcSpaApi";

export type OidcSpaApiBuilder<
    AutoLogin extends boolean = false,
    DecodedIdToken extends Record<string, unknown> = Oidc_core.Tokens.DecodedIdToken_OidcCoreSpec,
    ExcludedMethod extends
        | "withAutoLogin"
        | "withExpectedDecodedIdTokenShape"
        | "withAccessTokenValidation"
        | "createApi" = never
> = Omit<
    {
        withAutoLogin: () => OidcSpaApiBuilder<true, DecodedIdToken, ExcludedMethod | "withAutoLogin">;
        withExpectedDecodedIdTokenShape: <DecodedIdToken extends Record<string, unknown>>(params: {
            decodedIdTokenSchema: ZodSchemaLike<
                Oidc_core.Tokens.DecodedIdToken_OidcCoreSpec,
                DecodedIdToken
            >;
            decodedIdToken_mock?: NoInfer<DecodedIdToken>;
        }) => OidcSpaApiBuilder<
            AutoLogin,
            DecodedIdToken,
            ExcludedMethod | "withExpectedDecodedIdTokenShape"
        >;

        createApi: () => OidcSpaApi<AutoLogin, DecodedIdToken>;
    },
    ExcludedMethod
>;

function createOidcSpaApiBuilder<
    AutoLogin extends boolean = false,
    DecodedIdToken extends Record<string, unknown> = Oidc_core.Tokens.DecodedIdToken_OidcCoreSpec
>(params: {
    autoLogin: AutoLogin;
    decodedIdTokenSchema:
        | ZodSchemaLike<Oidc_core.Tokens.DecodedIdToken_OidcCoreSpec, DecodedIdToken>
        | undefined;
    decodedIdToken_mock: DecodedIdToken | undefined;
}): OidcSpaApiBuilder<AutoLogin, DecodedIdToken> {
    return {
        withAutoLogin: () =>
            createOidcSpaApiBuilder({
                autoLogin: true,
                decodedIdTokenSchema: params.decodedIdTokenSchema,
                decodedIdToken_mock: params.decodedIdToken_mock
            }),
        withExpectedDecodedIdTokenShape: ({ decodedIdTokenSchema, decodedIdToken_mock }) =>
            createOidcSpaApiBuilder({
                autoLogin: params.autoLogin,
                decodedIdTokenSchema,
                decodedIdToken_mock: decodedIdToken_mock
            }),
        createApi: () =>
            createOidcSpaApi<AutoLogin, DecodedIdToken>({
                autoLogin: params.autoLogin,
                decodedIdTokenSchema: params.decodedIdTokenSchema,
                decodedIdToken_mock: params.decodedIdToken_mock
            })
    };
}

export const oidcSpaApiBuilder = createOidcSpaApiBuilder({
    autoLogin: false,
    decodedIdToken_mock: undefined,
    decodedIdTokenSchema: undefined
});
