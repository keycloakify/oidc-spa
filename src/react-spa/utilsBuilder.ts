import type { OidcSpaUtils } from "./types";
import type { Oidc as Oidc_core } from "../core";
import type { ZodSchemaLike } from "../tools/ZodSchemaLike";
import { createOidcSpaUtils } from "./createOidcSpaUtils";

export type OidcSpaUtilsBuilder<
    AutoLogin extends boolean = false,
    DecodedIdToken extends Record<string, unknown> = Oidc_core.Tokens.DecodedIdToken_OidcCoreSpec,
    ExcludedMethod extends
        | "withAutoLogin"
        | "withExpectedDecodedIdTokenShape"
        | "withAccessTokenValidation"
        | "createUtils" = never
> = Omit<
    {
        withAutoLogin: () => OidcSpaUtilsBuilder<true, DecodedIdToken, ExcludedMethod | "withAutoLogin">;
        withExpectedDecodedIdTokenShape: <DecodedIdToken extends Record<string, unknown>>(params: {
            decodedIdTokenSchema: ZodSchemaLike<
                Oidc_core.Tokens.DecodedIdToken_OidcCoreSpec,
                DecodedIdToken
            >;
            decodedIdToken_mock?: NoInfer<DecodedIdToken>;
        }) => OidcSpaUtilsBuilder<
            AutoLogin,
            DecodedIdToken,
            ExcludedMethod | "withExpectedDecodedIdTokenShape"
        >;

        createUtils: () => OidcSpaUtils<AutoLogin, DecodedIdToken>;
    },
    ExcludedMethod
>;

function createOidcSpaUtilsBuilder<
    AutoLogin extends boolean = false,
    DecodedIdToken extends Record<string, unknown> = Oidc_core.Tokens.DecodedIdToken_OidcCoreSpec
>(params: {
    autoLogin: AutoLogin;
    decodedIdTokenSchema:
        | ZodSchemaLike<Oidc_core.Tokens.DecodedIdToken_OidcCoreSpec, DecodedIdToken>
        | undefined;
    decodedIdToken_mock: DecodedIdToken | undefined;
}): OidcSpaUtilsBuilder<AutoLogin, DecodedIdToken> {
    return {
        withAutoLogin: () =>
            createOidcSpaUtilsBuilder({
                autoLogin: true,
                decodedIdTokenSchema: params.decodedIdTokenSchema,
                decodedIdToken_mock: params.decodedIdToken_mock
            }),
        withExpectedDecodedIdTokenShape: ({ decodedIdTokenSchema, decodedIdToken_mock }) =>
            createOidcSpaUtilsBuilder({
                autoLogin: params.autoLogin,
                decodedIdTokenSchema,
                decodedIdToken_mock: decodedIdToken_mock
            }),
        createUtils: () =>
            createOidcSpaUtils<AutoLogin, DecodedIdToken>({
                autoLogin: params.autoLogin,
                decodedIdTokenSchema: params.decodedIdTokenSchema,
                decodedIdToken_mock: params.decodedIdToken_mock
            })
    };
}

export const oidcSpaUtilsBuilder = createOidcSpaUtilsBuilder({
    autoLogin: false,
    decodedIdToken_mock: undefined,
    decodedIdTokenSchema: undefined
});
