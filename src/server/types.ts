/**
 * Claims defined by RFC 9068: "JSON Web Token (JWT) Profile for OAuth 2.0 Access Tokens"
 * https://datatracker.ietf.org/doc/html/rfc9068
 *
 * These tokens are intended for consumption by resource servers.
 */
export type DecodedAccessToken_RFC9068 = {
    // --- REQUIRED (MUST) ---
    iss: string; // Issuer Identifier
    sub: string; // Subject Identifier
    aud: string | string[]; // Audience(s)
    exp: number; // Expiration time (seconds since epoch)
    iat: number; // Issued-at time (seconds since epoch)

    // --- RECOMMENDED (SHOULD) ---
    client_id?: string; // OAuth2 Client ID that requested the token
    scope?: string; // Space-separated list of granted scopes
    jti?: string; // Unique JWT ID (for replay detection)

    // --- OPTIONAL / EXTENSION CLAIMS ---
    nbf?: number; // Not-before time (standard JWT claim)
    auth_time?: number; // Time of user authentication (optional)
    cnf?: Record<string, unknown>; // Confirmation (e.g. proof-of-possession)
    [key: string]: unknown; // Allow custom claims (e.g. roles, groups)
};

export type ValidateAndDecodeAccessToken<DecodedAccessToken> = (
    params: ValidateAndDecodeAccessToken.Params
) => Promise<ValidateAndDecodeAccessToken.ReturnType<DecodedAccessToken>>;

export namespace ValidateAndDecodeAccessToken {
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

    export type ReturnType<DecodedAccessToken> =
        | (ReturnType.Success<DecodedAccessToken> & { errorCause?: never; debugErrorMessage?: never })
        | (ReturnType.Errored & {
              decodedAccessToken?: never;
              decodedAccessToken_original?: never;
              accessToken?: never;
          });

    export namespace ReturnType {
        export type Success<DecodedAccessToken> = {
            isSuccess: true;
            decodedAccessToken: DecodedAccessToken;
            decodedAccessToken_original: DecodedAccessToken_RFC9068;
            accessToken: string;
        };

        export type Errored = {
            isSuccess: false;
            errorCause:
                | "validation error"
                | "validation error - access token expired"
                | "validation error - invalid signature";
            debugErrorMessage: string;
        };
    }
}

export type ParamsOfBootstrap<DecodedAccessToken> =
    | ParamsOfBootstrap.Real
    | ParamsOfBootstrap.Mock<DecodedAccessToken>;

export namespace ParamsOfBootstrap {
    export type Real = {
        implementation: "real";
        issuerUri: string;
        expectedAudience: string | undefined;
    };

    export type Mock<DecodedAccessToken> = Mock.DecodeOnly | Mock.UseStaticIdentity<DecodedAccessToken>;

    export namespace Mock {
        type Common = {
            implementation: "mock";
        };

        export type DecodeOnly = Common & {
            behavior: "decode only";
        };

        export type UseStaticIdentity<DecodedAccessToken> = Common & {
            behavior: "use static identity";
            decodedAccessToken_mock: DecodedAccessToken;
            decodedAccessToken_original_mock?: DecodedAccessToken_RFC9068;
            accessToken_mock?: string;
        };
    }
}

export type OidcSpaUtils<DecodedAccessToken> = {
    bootstrapAuth: (params: ParamsOfBootstrap<DecodedAccessToken>) => Promise<void>;
    validateAndDecodeAccessToken: ValidateAndDecodeAccessToken<DecodedAccessToken>;
    ofTypeDecodedAccessToken: DecodedAccessToken;
};
