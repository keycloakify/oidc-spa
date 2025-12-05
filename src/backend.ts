import { assert, id } from "./vendor/backend/tsafe";
import type { ZodSchemaLike } from "./tools/ZodSchemaLike";
import { DecodedAccessToken_RFC9068 } from "./server/types";
import { oidcSpa } from "./server";

export type { DecodedAccessToken_RFC9068 };

export type ParamsOfCreateOidcBackend<DecodedAccessToken> = {
    issuerUri: string;
    decodedAccessTokenSchema?: ZodSchemaLike<DecodedAccessToken_RFC9068, DecodedAccessToken>;
};

export type OidcBackend<DecodedAccessToken extends Record<string, unknown>> = {
    verifyAndDecodeAccessToken(params: {
        accessToken: string;
    }): Promise<ResultOfAccessTokenVerify<DecodedAccessToken>>;
};

export type ResultOfAccessTokenVerify<DecodedAccessToken> =
    | ResultOfAccessTokenVerify.Valid<DecodedAccessToken>
    | ResultOfAccessTokenVerify.Invalid;

export namespace ResultOfAccessTokenVerify {
    export type Valid<DecodedAccessToken> = {
        isValid: true;

        decodedAccessToken: DecodedAccessToken;
        decodedAccessToken_original: DecodedAccessToken_RFC9068;

        errorCase?: never;
        errorMessage?: never;
    };

    export type Invalid = {
        isValid: false;
        errorCase: "expired" | "invalid signature" | "does not respect schema";
        errorMessage: string;

        decodedAccessToken?: never;
        decodedAccessToken_original?: never;
    };
}

/** @deprecated: Use "oidc-spa/server" instead */
export async function createOidcBackend<
    DecodedAccessToken extends Record<string, unknown> = DecodedAccessToken_RFC9068
>(params: ParamsOfCreateOidcBackend<DecodedAccessToken>): Promise<OidcBackend<DecodedAccessToken>> {
    const { issuerUri, decodedAccessTokenSchema } = params;

    const { bootstrapAuth, validateAndDecodeAccessToken } =
        decodedAccessTokenSchema === undefined
            ? oidcSpa.createUtils()
            : oidcSpa.withExpectedDecodedAccessTokenShape({ decodedAccessTokenSchema }).createUtils();

    await bootstrapAuth({
        implementation: "real",
        issuerUri,
        expectedAudience: undefined
    });

    return {
        verifyAndDecodeAccessToken: async ({ accessToken }) => {
            const {
                isSuccess,
                errorCause,
                errorDebugMessage,
                decodedAccessToken,
                decodedAccessToken_original
            } = await validateAndDecodeAccessToken({
                request: {
                    method: "GET",
                    url: "https://dummy.com",
                    headers: {
                        Authorization: `Bearer ${accessToken}`,
                        DPoP: undefined
                    }
                }
            });

            if (!isSuccess) {
                switch (errorCause) {
                    case "missing Authorization header":
                        assert(false, "29330204");
                    case "validation error":
                        return {
                            isValid: false,
                            errorCase: "invalid signature",
                            errorMessage: errorDebugMessage
                        };
                    case "validation error - access token expired":
                        return {
                            isValid: false,
                            errorCase: "expired",
                            errorMessage: errorDebugMessage
                        };
                    case "validation error - invalid signature":
                        return {
                            isValid: false,
                            errorCase: "invalid signature",
                            errorMessage: errorDebugMessage
                        };
                }
            }

            return id<ResultOfAccessTokenVerify.Valid<DecodedAccessToken>>({
                isValid: true,
                // @ts-expect-error
                decodedAccessToken,
                decodedAccessToken_original
            });
        }
    };
}
