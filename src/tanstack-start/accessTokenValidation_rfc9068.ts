import type { CreateValidateAndGetAccessTokenClaims, ParamsOfBootstrap } from "./react";
import type { DecodedAccessToken_RFC9068 as AccessTokenClaims_RFC9068 } from "../backend";
import type { ZodSchemaLike } from "../tools/ZodSchemaLike";
import { createObjectThatThrowsIfAccessed } from "../tools/createObjectThatThrowsIfAccessed";
import { assert, type Equals, is } from "../tools/tsafe/assert";

export function createCreateValidateAndGetAccessTokenClaims_rfc9068<
    AccessTokenClaims extends Record<string, unknown>
>(params: {
    accessTokenClaimsSchema?: ZodSchemaLike<AccessTokenClaims_RFC9068, AccessTokenClaims>;
    accessTokenClaims_mock?: AccessTokenClaims;
    expectedAudience?:
        | string
        | ((params: {
              paramsOfBootstrap: ParamsOfBootstrap<boolean, Record<string, unknown>, AccessTokenClaims>;
          }) => string);
}) {
    const {
        accessTokenClaimsSchema,
        accessTokenClaims_mock,
        expectedAudience: expectedAudienceOrGetter
    } = params;

    const createValidateAndGetAccessTokenClaims: CreateValidateAndGetAccessTokenClaims<
        AccessTokenClaims
    > = ({ paramsOfBootstrap }) => {
        if (paramsOfBootstrap.implementation === "mock") {
            return {
                validateAndGetAccessTokenClaims: async () => {
                    return {
                        isValid: true,
                        accessTokenClaims: (() => {
                            if (paramsOfBootstrap.accessTokenClaims_mock !== undefined) {
                                assert(is<AccessTokenClaims>(paramsOfBootstrap.accessTokenClaims_mock));
                                return paramsOfBootstrap.accessTokenClaims_mock;
                            }

                            if (accessTokenClaims_mock !== undefined) {
                                return accessTokenClaims_mock;
                            }

                            return createObjectThatThrowsIfAccessed<AccessTokenClaims>({
                                debugMessage: [
                                    "oidc-spa: You didn't provide any mock for the accessTokenClaims",
                                    "Either provide a default one by specifying accessTokenClaims_mock",
                                    "as parameter of .withAccessTokenValidation() or",
                                    "specify accessTokenClaims_mock when calling bootstrapOidc()"
                                ].join(" ")
                            });
                        })()
                    };
                }
            };
        }
        assert<Equals<(typeof paramsOfBootstrap)["implementation"], "real">>;

        const prVerifyAndDecodeAccessToken = (async () => {
            const { createOidcBackend } = await import("../backend");

            const { verifyAndDecodeAccessToken } = await createOidcBackend({
                issuerUri: paramsOfBootstrap.issuerUri,
                decodedAccessTokenSchema: accessTokenClaimsSchema
            });

            return verifyAndDecodeAccessToken;
        })();

        const expectedAudience = (() => {
            if (expectedAudienceOrGetter === undefined) {
                return undefined;
            }
            if (typeof expectedAudienceOrGetter === "function") {
                return expectedAudienceOrGetter({ paramsOfBootstrap });
            }
            return expectedAudienceOrGetter;
        })();

        return {
            validateAndGetAccessTokenClaims: async ({ accessToken }) => {
                const verifyAndDecodeAccessToken = await prVerifyAndDecodeAccessToken;

                const {
                    isValid,
                    errorCase,
                    errorMessage,
                    decodedAccessToken,
                    decodedAccessToken_original
                } = verifyAndDecodeAccessToken({ accessToken });

                if (!isValid) {
                    return {
                        isValid: false,
                        errorMessage: `${errorCase}: ${errorMessage}`,
                        wwwAuthenticateHeaderErrorDescription: (() => {
                            switch (errorCase) {
                                case "does not respect schema":
                                    return "The access token is malformed or missing required claims";
                                case "expired":
                                    return "The access token expired";
                                case "invalid signature":
                                    return "The access token signature is invalid";
                            }
                        })()
                    };
                }

                if (expectedAudience !== undefined) {
                    const aud_array =
                        typeof decodedAccessToken_original.aud === "string"
                            ? [decodedAccessToken_original.aud]
                            : decodedAccessToken_original.aud;

                    if (!aud_array.includes(expectedAudience)) {
                        return {
                            isValid: false,
                            errorMessage: [
                                "Access token is not for the expected audience.",
                                `Got aud claim: ${JSON.stringify(decodedAccessToken_original.aud)}`,
                                `Expected: ${expectedAudience}`
                            ].join(" "),
                            wwwAuthenticateHeaderErrorDescription: "The access token audience is invalid"
                        };
                    }
                }

                return {
                    isValid: true,
                    accessTokenClaims: decodedAccessToken
                };
            }
        };
    };

    return { createValidateAndGetAccessTokenClaims };
}
