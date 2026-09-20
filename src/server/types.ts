/** Claims in common from RFC7662 (token introspection) and RFC9068 (JWT Payload) */
export type AccessTokenClaims_specs = {
    scope?: string;
    client_id?: string;
    exp?: number;
    iat?: number;
    nbf?: number;
    sub?: string;
    aud?: string | string[];
    iss?: string;
    jti?: string;
    cnf?: {
        jkt?: string;
        [key: string]: unknown;
    };
    [key: string]: unknown;
};

export type ValidateAndGetAccessTokenClaims<AccessTokenClaims> = (
    params: ValidateAndGetAccessTokenClaims.Params
) => Promise<ValidateAndGetAccessTokenClaims.ReturnType<AccessTokenClaims>>;

export namespace ValidateAndGetAccessTokenClaims {
    export type Params = Params.Bearer | Params.DPoP;

    export namespace Params {
        type Common = {
            accessToken: string;
        };

        export type Bearer = Common & {
            scheme: "Bearer";
            rejectIfAccessTokenDPoPBound: boolean;
        };

        export type DPoP = Common & {
            scheme: "DPoP";
            dpopProof: string;
            expectedHtu: string | undefined;
            expectedHtm: string | undefined;
        };
    }

    export type ReturnType<AccessTokenClaims> =
        | (ReturnType.Success<AccessTokenClaims> & {
              errorCause?: never;
              debugErrorMessage?: never;
              recommendedHttpErrorStatusCode?: never;
          })
        | (ReturnType.Errored & {
              accessTokenClaims?: never;
              accessTokenClaims_original?: never;
              accessToken?: never;
          });

    export namespace ReturnType {
        export type Success<AccessTokenClaims> = {
            isSuccess: true;
            accessTokenClaims: AccessTokenClaims;
            accessTokenClaims_original: AccessTokenClaims_specs;
            accessToken: string;
        };

        export type Errored = {
            isSuccess: false;
            recommendedHttpErrorStatusCode: 401 | 500 | 503;
            debugErrorMessage: string;
        };
    }
}

export type ParamsOfBootstrap<AccessTokenClaims> =
    | ParamsOfBootstrap.Real
    | ParamsOfBootstrap.Mock<AccessTokenClaims>
    | ParamsOfBootstrap.DecodeOnly;

export namespace ParamsOfBootstrap {
    export type Real = {
        mode: "real";
        issuerUri: string;
        accessTokenValidation: Real.AccessTokenValidation;
    };
    export namespace Real {
        export type AccessTokenValidation =
            | AccessTokenValidation.OfflineJWTValidation
            | AccessTokenValidation.IntrospectionEndpoint;

        export namespace AccessTokenValidation {
            export type OfflineJWTValidation = {
                method: "offline JWT validation";
                expectedAudience: string;
            };

            export type IntrospectionEndpoint = {
                method: "introspection endpoint";
                clientId: string;
                clientSecret: string;
            };
        }
    }

    export type Mock<AccessTokenClaims> = {
        mode: "mock";
        accessTokenClaims_mock: AccessTokenClaims;
        accessTokenClaims_original_mock?: AccessTokenClaims_specs;
        accessToken_mock?: string;
    };

    export type DecodeOnly = {
        mode: "unsafe decode only";
    };
}

export type OidcSpaUtils<AccessTokenClaims> = {
    bootstrapAuth: (params: ParamsOfBootstrap<AccessTokenClaims>) => void;
    validateAndGetAccessTokenClaims: ValidateAndGetAccessTokenClaims<AccessTokenClaims>;
};
