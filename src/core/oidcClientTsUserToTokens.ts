import type { User as OidcClientTsUser } from "../vendor/frontend/oidc-client-ts";
import { assert } from "../tools/tsafe/assert";
import { id } from "../tools/tsafe/id";
import { readExpirationTimeInJwt } from "../tools/readExpirationTimeInJwt";
import { decodeJwt } from "../tools/decodeJwt";
import type { Oidc } from "./Oidc";
import { INFINITY_TIME } from "../tools/INFINITY_TIME";
import { registerAccessTokenForDPoP } from "./earlyInit_DPoP";
import { createGetServerDateNow, type ParamsOfCreateGetServerDateNow } from "../tools/getServerDateNow";

export function createOidcClientTsUserToTokens<DecodedIdToken extends Record<string, unknown>>(params: {
    configId: string;
    decodedIdTokenSchema?: {
        parse: (decodedIdToken_original: Oidc.Tokens.DecodedIdToken_OidcCoreSpec) => DecodedIdToken;
    };
    __unsafe_useIdTokenAsAccessToken: boolean;
    isDPoPEnabled: boolean;

    getTokensPlaceholders:
        | ((params: {
              configId: string;
              tokens: {
                  accessToken: string;
                  idToken: string;
                  refreshToken?: string;
              };
          }) => {
              accessToken: string;
              idToken: string;
              refreshToken?: string;
          })
        | undefined;

    log: typeof console.log | undefined;
}) {
    const {
        configId,
        decodedIdTokenSchema,
        __unsafe_useIdTokenAsAccessToken,
        isDPoPEnabled,
        getTokensPlaceholders,
        log
    } = params;

    function oidcClientTsUserToTokens(params: {
        oidcClientTsUser: OidcClientTsUser;
        decodedIdToken_previous: DecodedIdToken | undefined;
    }): Oidc.Tokens<DecodedIdToken> {
        const { oidcClientTsUser, decodedIdToken_previous } = params;

        const isFirstInit = decodedIdToken_previous === undefined;

        const accessToken = oidcClientTsUser.access_token;

        const refreshToken = oidcClientTsUser.refresh_token;

        const idToken = oidcClientTsUser.id_token;

        assert(idToken !== undefined, "No id token provided by the oidc server");

        const decodedIdToken_original = decodeJwt<Oidc.Tokens.DecodedIdToken_OidcCoreSpec>(idToken);

        if (isFirstInit) {
            log?.(
                [
                    `Decoded ID token`,
                    decodedIdTokenSchema === undefined ? "" : " before `decodedIdTokenSchema.parse()`\n",
                    JSON.stringify(decodedIdToken_original, null, 2)
                ].join("")
            );
        }

        const decodedIdToken = (() => {
            let decodedIdToken: DecodedIdToken;

            if (decodedIdTokenSchema !== undefined) {
                decodedIdToken = decodedIdTokenSchema.parse(decodedIdToken_original);

                if (isFirstInit) {
                    log?.(
                        [
                            "Decoded ID token after `decodedIdTokenSchema.parse()`\n",
                            JSON.stringify(decodedIdToken, null, 2)
                        ].join("")
                    );
                }
            } else {
                // @ts-expect-error
                decodedIdToken = decodedIdToken_original;
            }

            if (
                decodedIdToken_previous !== undefined &&
                JSON.stringify(decodedIdToken) === JSON.stringify(decodedIdToken_previous)
            ) {
                // NOTE: For stable ref, prevent re-render for component that would memoize
                return decodedIdToken_previous;
            }

            return decodedIdToken;
        })();

        const issuedAtTime = (() => {
            // NOTE: The id_token is always a JWT as per the protocol.
            // We don't use Date.now() due to network latency or if the
            // local clock is inaccurate.
            const id_token_iat = (() => {
                let iat: number | undefined;

                try {
                    const iat_claimValue = decodedIdToken_original.iat;
                    assert(iat_claimValue === undefined || typeof iat_claimValue === "number");
                    iat = iat_claimValue;
                } catch {
                    iat = undefined;
                }

                if (iat === undefined) {
                    return undefined;
                }

                return iat;
            })();

            if (id_token_iat === undefined) {
                return Date.now();
            }

            return id_token_iat * 1000;
        })();

        const paramsOfCreateGetServerDateNow: ParamsOfCreateGetServerDateNow = {
            issuedAtTime_local: oidcClientTsUser.__oidc_spa_localTimeWhenTokenIssued,
            issuedAtTime
        };

        const tokens_common: Oidc.Tokens.Common<DecodedIdToken> = {
            ...(__unsafe_useIdTokenAsAccessToken
                ? {
                      accessToken: idToken,
                      accessTokenExpirationTime: (() => {
                          const expirationTime = readExpirationTimeInJwt(idToken);

                          assert(
                              expirationTime !== undefined,
                              "Failed to get id token expiration time while trying to substitute the access token by the id token"
                          );

                          return expirationTime;
                      })()
                  }
                : {
                      accessToken,
                      accessTokenExpirationTime: (() => {
                          read_from_jwt: {
                              const expirationTime = readExpirationTimeInJwt(accessToken);

                              if (expirationTime === undefined) {
                                  break read_from_jwt;
                              }

                              return expirationTime;
                          }

                          read_from_token_response_expires_at: {
                              const { expires_at } = oidcClientTsUser.__oidc_spa_tokenResponse;

                              if (expires_at === undefined) {
                                  break read_from_token_response_expires_at;
                              }

                              assert(typeof expires_at === "number", "2033392");

                              return expires_at * 1000;
                          }

                          read_from_token_response_expires_in: {
                              const { expires_in } = oidcClientTsUser.__oidc_spa_tokenResponse;

                              if (expires_in === undefined) {
                                  break read_from_token_response_expires_in;
                              }

                              assert(typeof expires_in === "number", "203333425");

                              return issuedAtTime + expires_in * 1_000;
                          }

                          assert(false, "Failed to get access token expiration time");
                      })()
                  }),
            idToken,
            decodedIdToken,
            decodedIdToken_original,
            issuedAtTime,
            getServerDateNow: createGetServerDateNow(paramsOfCreateGetServerDateNow)
        };

        const tokens: Oidc.Tokens<DecodedIdToken> =
            refreshToken === undefined
                ? id<Oidc.Tokens.WithoutRefreshToken<DecodedIdToken>>({
                      ...tokens_common,
                      hasRefreshToken: false
                  })
                : id<Oidc.Tokens.WithRefreshToken<DecodedIdToken>>({
                      ...tokens_common,
                      hasRefreshToken: true,
                      refreshToken,
                      refreshTokenExpirationTime: (() => {
                          read_from_token_response_expires_at: {
                              const { refresh_expires_at } = oidcClientTsUser.__oidc_spa_tokenResponse;

                              if (refresh_expires_at === undefined) {
                                  break read_from_token_response_expires_at;
                              }

                              assert(typeof refresh_expires_at === "number", "2033392");

                              if (refresh_expires_at === 0) {
                                  return INFINITY_TIME;
                              }

                              return refresh_expires_at * 1000;
                          }

                          read_from_token_response_expires_in: {
                              const { refresh_expires_in } = oidcClientTsUser.__oidc_spa_tokenResponse;

                              if (refresh_expires_in === undefined) {
                                  break read_from_token_response_expires_in;
                              }

                              assert(typeof refresh_expires_in === "number", "2033425330");

                              if (refresh_expires_in === 0) {
                                  return INFINITY_TIME;
                              }

                              return issuedAtTime + refresh_expires_in * 1000;
                          }

                          read_from_jwt: {
                              const expirationTime = readExpirationTimeInJwt(refreshToken);

                              if (expirationTime === undefined) {
                                  break read_from_jwt;
                              }

                              return expirationTime;
                          }

                          return undefined;
                      })()
                  });

        if (isDPoPEnabled) {
            registerAccessTokenForDPoP({
                configId,
                accessToken: tokens.accessToken,
                paramsOfCreateGetServerDateNow
            });
        }

        if (getTokensPlaceholders !== undefined) {
            const placeholders = getTokensPlaceholders({
                configId,
                tokens
            });

            tokens.accessToken = placeholders.accessToken;
            tokens.idToken = placeholders.idToken;
            tokens.refreshToken = placeholders.refreshToken;
        }

        if (
            isFirstInit &&
            tokens.hasRefreshToken &&
            tokens.refreshTokenExpirationTime !== undefined &&
            tokens.refreshTokenExpirationTime < tokens.accessTokenExpirationTime
        ) {
            console.warn(
                [
                    "The OIDC refresh token expirationTime is shorter than the one of the access token.",
                    "This is very unusual and probably a misconfiguration."
                ].join(" ")
            );
        }

        return tokens;
    }

    return { oidcClientTsUserToTokens };
}
