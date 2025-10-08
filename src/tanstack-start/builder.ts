import {
    type OidcSpaApi,
    type ZodSchemaLike,
    type AccessTokenClaims_RFC9068,
    type CreateValidateAndGetAccessTokenClaims,
    type ParamsOfBootstrap,
    createOidcSpaApi
} from "./react";
import type { Oidc as Oidc_core } from "../core";
import { createObjectThatThrowsIfAccessed } from "../tools/createObjectThatThrowsIfAccessed";
import { id } from "../tools/tsafe/id";
import { assert, type Equals } from "../tools/tsafe/assert";
import { Reflect } from "../tools/tsafe/Reflect";

export type OidcSpaApiBuilder<
    AutoLogin extends boolean = false,
    DecodedIdToken extends Record<string, unknown> = Oidc_core.Tokens.DecodedIdToken_OidcCoreSpec,
    AccessTokenClaims extends Record<string, unknown> | undefined = undefined,
    ExcludedMethod extends
        | "withAutoLogin"
        | "withExpectedDecodedIdTokenShape"
        | "withAccessTokenValidation"
        | "finalize" = never
> = Omit<
    {
        withAutoLogin: () => OidcSpaApiBuilder<
            true,
            DecodedIdToken,
            AccessTokenClaims,
            ExcludedMethod | "withAutoLogin"
        >;
        withExpectedDecodedIdTokenShape: <DecodedIdToken extends Record<string, unknown>>(params: {
            decodedIdTokenSchema: ZodSchemaLike<
                Oidc_core.Tokens.DecodedIdToken_OidcCoreSpec,
                DecodedIdToken
            >;
            decodedIdTokenDefaultMock?: NoInfer<DecodedIdToken>;
        }) => OidcSpaApiBuilder<
            AutoLogin,
            DecodedIdToken,
            AccessTokenClaims,
            ExcludedMethod | "withExpectedDecodedIdTokenShape"
        >;
        withAccessTokenValidation: {
            <AccessTokenClaims extends Record<string, unknown> = AccessTokenClaims_RFC9068>(params: {
                type: "RFC 9068: JSON Web Token (JWT) Profile for OAuth 2.0 Access Tokens";
                accessTokenClaimsSchema?: ZodSchemaLike<any, AccessTokenClaims>;
                accessTokenClaimDefaultMock?: NoInfer<AccessTokenClaims>;
                additionalValidation?: (params: {
                    paramsOfBootstrap: ParamsOfBootstrap<
                        AutoLogin,
                        DecodedIdToken,
                        NoInfer<AccessTokenClaims>
                    >;
                    accessTokenClaims: NoInfer<AccessTokenClaims>;
                }) => boolean;
            }): OidcSpaApiBuilder<
                AutoLogin,
                DecodedIdToken,
                AccessTokenClaims,
                ExcludedMethod | "withAccessTokenValidation"
            >;
            <AccessTokenClaims extends Record<string, unknown>>(params: {
                type: "custom";
                createValidateAndGetAccessTokenClaims: CreateValidateAndGetAccessTokenClaims<AccessTokenClaims>;
            }): OidcSpaApiBuilder<
                AutoLogin,
                DecodedIdToken,
                AccessTokenClaims,
                ExcludedMethod | "withAccessTokenValidation"
            >;
        };

        finalize: () => OidcSpaApi<AutoLogin, DecodedIdToken, AccessTokenClaims>;
    },
    ExcludedMethod
>;

function createOidcSpaApiBuilder<
    AutoLogin extends boolean = false,
    DecodedIdToken extends Record<string, unknown> = Oidc_core.Tokens.DecodedIdToken_OidcCoreSpec,
    AccessTokenClaims extends Record<string, unknown> | undefined = undefined
>(params: {
    autoLogin: AutoLogin;
    decodedIdTokenSchema:
        | ZodSchemaLike<Oidc_core.Tokens.DecodedIdToken_OidcCoreSpec, DecodedIdToken>
        | undefined;
    decodedIdTokenDefaultMock: DecodedIdToken | undefined;
    createValidateAndGetAccessTokenClaims:
        | CreateValidateAndGetAccessTokenClaims<AccessTokenClaims>
        | undefined;
}): OidcSpaApiBuilder<AutoLogin, DecodedIdToken, AccessTokenClaims> {
    return {
        withAutoLogin: () =>
            createOidcSpaApiBuilder({
                autoLogin: true,
                decodedIdTokenSchema: params.decodedIdTokenSchema,
                decodedIdTokenDefaultMock: params.decodedIdTokenDefaultMock,
                createValidateAndGetAccessTokenClaims: params.createValidateAndGetAccessTokenClaims
            }),
        withExpectedDecodedIdTokenShape: ({ decodedIdTokenSchema, decodedIdTokenDefaultMock }) =>
            createOidcSpaApiBuilder({
                autoLogin: params.autoLogin,
                decodedIdTokenSchema: decodedIdTokenSchema,
                // @ts-expect-error: NoInfer<>
                decodedIdTokenDefaultMock:
                    // @ts-expect-error: NoInfer<>
                    id<DecodedIdToken | undefined>(decodedIdTokenDefaultMock) ??
                    createObjectThatThrowsIfAccessed<DecodedIdToken>({
                        debugMessage: "Need to provide mock for decodedIdToken"
                    }),
                createValidateAndGetAccessTokenClaims: params.createValidateAndGetAccessTokenClaims
            }),
        withAccessTokenValidation: params_scope =>
            createOidcSpaApiBuilder({
                autoLogin: params.autoLogin,
                decodedIdTokenSchema: params.decodedIdTokenSchema,
                decodedIdTokenDefaultMock: params.decodedIdTokenDefaultMock,
                createValidateAndGetAccessTokenClaims: ((): any => {
                    switch (params_scope.type) {
                        case "RFC 9068: JSON Web Token (JWT) Profile for OAuth 2.0 Access Tokens":
                            // TODO: Implement using oidc-spa/server
                            return Reflect<CreateValidateAndGetAccessTokenClaims<AccessTokenClaims>>();
                        case "custom":
                            return params_scope.createValidateAndGetAccessTokenClaims;
                        default:
                            assert<Equals<typeof params_scope, never>>(false);
                    }
                })()
            }),
        finalize: () =>
            createOidcSpaApi({
                autoLogin: params.autoLogin,
                decodedIdTokenSchema: params.decodedIdTokenSchema,
                decodedIdTokenDefaultMock: params.decodedIdTokenDefaultMock,
                createValidateAndGetAccessTokenClaims: params.createValidateAndGetAccessTokenClaims
            })
    };
}

const oidcSpaApiBuilder = createOidcSpaApiBuilder({
    autoLogin: false,
    createValidateAndGetAccessTokenClaims: undefined,
    decodedIdTokenDefaultMock: undefined,
    decodedIdTokenSchema: undefined
});

export const oidcSpa = oidcSpaApiBuilder;

/*
import { z } from "zod";

const { useOidc } = oidcSpa
    .withExpectedDecodedIdTokenShape({
        decodedIdTokenSchema: z.object({
            email: z.string()
        }),
        decodedIdTokenDefaultMock: {
            email: ""
        }
    })
    .finalize();
*/
