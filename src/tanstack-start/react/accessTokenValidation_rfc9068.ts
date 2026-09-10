import type { ParamsOfBootstrap, ParamsOfWithAccessTokenValidation } from "./types";
import { createObjectThatThrowsIfAccessed } from "../../tools/createObjectThatThrowsIfAccessed";
import { assert, type Equals, is, id } from "../../vendor/server/tsafe";

export type ValidateAndGetAccessTokenClaims<AccessTokenClaims> = (
    params: import("../../server/types").ValidateAndDecodeAccessToken.Params
) => Promise<ValidateAndGetAccessTokenClaims.ReturnType<AccessTokenClaims>>;

export namespace ValidateAndGetAccessTokenClaims {
    export type ReturnType<AccessTokenClaims> =
        | ReturnType.Success<AccessTokenClaims>
        | ReturnType.Errored;

    export namespace ReturnType {
        export type Success<AccessTokenClaims> = {
            isSuccess: true;
            accessTokenClaims: AccessTokenClaims;
            accessToken: string;
        };

        export type Errored = {
            isSuccess: false;
            debugErrorMessage: string;
            wwwAuthenticateResponseHeaderValue: string;
        };
    }
}

export async function createValidateAndGetAccessTokenClaims_rfc9068<
    AccessTokenClaims extends Record<string, unknown>
>(params: {
    paramsOfWithAccessTokenValidation: ParamsOfWithAccessTokenValidation<AccessTokenClaims>;
    paramsOfBootstrap: ParamsOfBootstrap<unknown, boolean, AccessTokenClaims>;
}) {
    const {
        paramsOfWithAccessTokenValidation: {
            accessTokenClaimsSchema,
            accessTokenClaims_mock,
            expectedAudience: expectedAudienceGetter
        },
        paramsOfBootstrap
    } = params;

    const { oidcSpa: oidcSpa_server } = await import("../../server");

    const oidcSpa_server_utils =
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
                                "it's probably an error.",
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

                await oidcSpa_server_utils.bootstrapAuth({
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

                await oidcSpa_server_utils.bootstrapAuth({
                    implementation: "mock",
                    behavior: "use static identity",
                    decodedAccessToken_mock,
                    accessToken_mock: "mock-access-token"
                });
            }
            break;
        default:
            assert<Equals<typeof paramsOfBootstrap, never>>(false);
    }

    const validateAndGetAccessTokenClaims: ValidateAndGetAccessTokenClaims<
        AccessTokenClaims
    > = async params => {
        const { isSuccess, errorCause, debugErrorMessage, decodedAccessToken, accessToken } =
            await oidcSpa_server_utils.validateAndDecodeAccessToken(params);

        if (!isSuccess) {
            return id<ValidateAndGetAccessTokenClaims.ReturnType.Errored>({
                isSuccess: false,
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
}
