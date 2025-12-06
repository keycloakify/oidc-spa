import type {
    CreateValidateAndGetAccessTokenClaims,
    ParamsOfBootstrap,
    ValidateAndGetAccessTokenClaims
} from "./types";
import type { DecodedAccessToken_RFC9068 as AccessTokenClaims_RFC9068 } from "../../server/types";
import type { ZodSchemaLike } from "../../tools/ZodSchemaLike";
import { createObjectThatThrowsIfAccessed } from "../../tools/createObjectThatThrowsIfAccessed";
import { assert, type Equals, is, id } from "../../vendor/server/tsafe";

export function createCreateValidateAndGetAccessTokenClaims_rfc9068<
    AccessTokenClaims extends Record<string, unknown>
>(params: {
    accessTokenClaimsSchema?: ZodSchemaLike<AccessTokenClaims_RFC9068, AccessTokenClaims>;
    accessTokenClaims_mock?: AccessTokenClaims;
    expectedAudience?: (params: {
        paramsOfBootstrap: ParamsOfBootstrap.Real<boolean>;
        process: { env: Record<string, string> };
    }) => string;
}) {
    const {
        accessTokenClaimsSchema,
        accessTokenClaims_mock,
        expectedAudience: expectedAudienceGetter
    } = params;

    const createValidateAndGetAccessTokenClaims: CreateValidateAndGetAccessTokenClaims<
        AccessTokenClaims
    > = ({ paramsOfBootstrap }) => {
        const prValidateAndDecodeAccessToken = (async () => {
            const { oidcSpa: oidcSpa_server } = await import("../../server");

            const { bootstrapAuth, validateAndDecodeAccessToken } =
                accessTokenClaimsSchema === undefined
                    ? (oidcSpa_server.createUtils() as never)
                    : oidcSpa_server
                          .withExpectedDecodedAccessTokenShape({
                              decodedAccessTokenSchema: accessTokenClaimsSchema
                          })
                          .createUtils();

            switch (paramsOfBootstrap.implementation) {
                case "real":
                    {
                        const expectedAudience = (() => {
                            if (expectedAudienceGetter === undefined) {
                                return undefined;
                            }

                            const missingEnvNames = new Set<string>();

                            const env_proxy = new Proxy<Record<string, string>>(
                                {},
                                {
                                    get: (...[, envName]) => {
                                        assert(typeof envName === "string");

                                        const value = process.env[envName];

                                        if (value === undefined) {
                                            missingEnvNames.add(envName);
                                            return "";
                                        }

                                        return value;
                                    },
                                    has: (...[, envName]) => {
                                        assert(typeof envName === "string");
                                        return true;
                                    }
                                }
                            );

                            const expectedAudience = expectedAudienceGetter?.({
                                paramsOfBootstrap,
                                process: { env: env_proxy }
                            });

                            if (!expectedAudience) {
                                throw new Error(
                                    [
                                        "oidc-spa: The expectedAudience() you provided returned empty.",
                                        "If you specified the expectedAudience in withAccessTokenValidation",
                                        "it's probably and error.",
                                        missingEnvNames.size !== 0 &&
                                            `Did you forget to set the env var: ${Array.from(
                                                missingEnvNames
                                            ).join(", ")} ?`
                                    ]
                                        .filter(line => typeof line === "string")
                                        .join(" ")
                                );
                            }

                            return expectedAudience;
                        })();

                        await bootstrapAuth({
                            implementation: "real",
                            issuerUri: paramsOfBootstrap.issuerUri,
                            expectedAudience
                        });
                    }
                    break;
                case "mock":
                    {
                        const decodedAccessToken_mock = (() => {
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
                        })();

                        await bootstrapAuth({
                            implementation: "mock",
                            behavior: "use static identity",
                            decodedAccessToken_mock
                        });
                    }
                    break;
                default:
                    assert<Equals<typeof paramsOfBootstrap, never>>(false);
            }

            return validateAndDecodeAccessToken;
        })();

        const validateAndGetAccessTokenClaims: ValidateAndGetAccessTokenClaims<
            AccessTokenClaims
        > = async ({ request }) => {
            const validateAndDecodeAccessToken = await prValidateAndDecodeAccessToken;

            const { isSuccess, errorCause, debugErrorMessage, decodedAccessToken, accessToken } =
                await validateAndDecodeAccessToken({
                    request
                });

            if (!isSuccess) {
                if (errorCause === "missing Authorization header") {
                    return id<ValidateAndGetAccessTokenClaims.ReturnType.Errored.AnonymousRequest>({
                        isSuccess: false,
                        isAnonymousRequest: true
                    });
                }

                return id<ValidateAndGetAccessTokenClaims.ReturnType.Errored.ValidationFailed>({
                    isSuccess: false,
                    isAnonymousRequest: false,
                    debugErrorMessage: `${errorCause}: ${debugErrorMessage}`,
                    wwwAuthenticateResponseHeaderValue: `Bearer error="invalid_token", error_description="${(() => {
                        switch (errorCause) {
                            case "validation error":
                            case "validation error - invalid signature":
                            case "validation error - access token expired":
                                return "Validation Failed";
                            default:
                                assert<Equals<typeof errorCause, never>>(false);
                        }
                    })()}"`
                });
            }

            return id<ValidateAndGetAccessTokenClaims.ReturnType.Success<AccessTokenClaims>>({
                isSuccess: true,
                accessTokenClaims: decodedAccessToken,
                accessToken
            });
        };

        return { validateAndGetAccessTokenClaims };
    };

    return { createValidateAndGetAccessTokenClaims };
}
