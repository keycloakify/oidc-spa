import type { User as OidcClientTsUser } from "../vendor/frontend/oidc-client-ts";
import { assert } from "../tools/tsafe/assert";
import { id } from "../tools/tsafe/id";
import { readExpirationTimeInJwt } from "../tools/readExpirationTimeInJwt";
import { decodeJwt } from "../tools/decodeJwt";
import type { Oidc } from "./Oidc";
import { INFINITY_TIME } from "../tools/INFINITY_TIME";
import { createGetServerDateNow, type ParamsOfCreateGetServerDateNow } from "../tools/getServerDateNow";
import type { Exports_DPoP, Exports_tokenSubstitution } from "./createOidc";

export function createOidcClientTsUserToTokens(params: {
    configId: string;
    __unsafe_useIdTokenAsAccessToken: boolean;
    exports_DPoP: Pick<Exports_DPoP, "registerAccessTokenForDPoP"> | undefined;
    exports_tokenSubstitution: Pick<Exports_tokenSubstitution, "getTokensPlaceholders"> | undefined;
    log: typeof console.log | undefined;
}) {
    const { configId, __unsafe_useIdTokenAsAccessToken, exports_DPoP, exports_tokenSubstitution, log } =
        params;

    let isFirstCall_next = true;

    function oidcClientTsUserToTokens(params: { oidcClientTsUser: OidcClientTsUser }): Oidc.Tokens {
        const isFirstCall = isFirstCall_next;

        isFirstCall_next = false;

        const { oidcClientTsUser } = params;

        const accessToken = oidcClientTsUser.access_token;

        const refreshToken = oidcClientTsUser.refresh_token;

        const idToken = oidcClientTsUser.id_token;

        assert(idToken !== undefined, "No id token provided by the oidc server");

        const decodedIdToken = decodeJwt<Oidc.Tokens.DecodedIdToken>(idToken);

        if (isFirstCall) {
            log?.([`Decoded ID token`, JSON.stringify(decodedIdToken, null, 2)].join(""));
        }

        const issuedAtTime = (() => {
            let id_token_iat = (() => {
                let iat: number | undefined;

                try {
                    const iat_claimValue = toNumber(decodedIdToken.iat);
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
                return oidcClientTsUser.__oidc_spa_localTimeWhenTokenIssued;
            }

            correct_entra_builtin_skew: {
                // See: https://github.com/keycloakify/oidc-spa/issues/162

                const expires_in = toNumber(oidcClientTsUser.__oidc_spa_tokenResponse["expires_in"]);

                if (expires_in === undefined) {
                    break correct_entra_builtin_skew;
                }

                let access_token_iat: number;
                let access_token_exp: number;

                try {
                    const decodedAccessToken = decodeJwt<Record<string, unknown>>(accessToken);

                    assert(decodedAccessToken instanceof Object);

                    const iat = toNumber(decodedAccessToken["iat"]);
                    const exp = toNumber(decodedAccessToken["exp"]);

                    assert(iat !== undefined);
                    assert(exp !== undefined);

                    access_token_iat = iat;
                    access_token_exp = exp;
                } catch {
                    break correct_entra_builtin_skew;
                }

                const access_token_expires_in = access_token_exp - access_token_iat;

                const builtin_skew_sec = access_token_expires_in - expires_in;

                id_token_iat += builtin_skew_sec;
            }

            return id_token_iat * 1000;
        })();

        const paramsOfCreateGetServerDateNow: ParamsOfCreateGetServerDateNow = {
            issuedAtTime_local: oidcClientTsUser.__oidc_spa_localTimeWhenTokenIssued,
            issuedAtTime
        };

        const tokens_common: Oidc.Tokens.Common = {
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
                              const expires_at = toNumber(
                                  oidcClientTsUser.__oidc_spa_tokenResponse["expires_at"]
                              );

                              if (expires_at === undefined) {
                                  break read_from_token_response_expires_at;
                              }

                              return expires_at * 1000;
                          }

                          read_from_token_response_expires_in: {
                              const expires_in = toNumber(
                                  oidcClientTsUser.__oidc_spa_tokenResponse["expires_in"]
                              );

                              if (expires_in === undefined) {
                                  break read_from_token_response_expires_in;
                              }

                              return issuedAtTime + expires_in * 1_000;
                          }

                          assert(false, "Failed to get access token expiration time");
                      })()
                  }),
            idToken,
            decodedIdToken,
            issuedAtTime,
            getServerDateNow: createGetServerDateNow(paramsOfCreateGetServerDateNow)
        };

        const tokens: Oidc.Tokens =
            refreshToken === undefined
                ? id<Oidc.Tokens.WithoutRefreshToken>({
                      ...tokens_common,
                      hasRefreshToken: false
                  })
                : id<Oidc.Tokens.WithRefreshToken>({
                      ...tokens_common,
                      hasRefreshToken: true,
                      refreshToken,
                      refreshTokenExpirationTime: (() => {
                          for (const propertyName of [
                              "refresh_expires_at",
                              "refresh_token_expires_at"
                          ] as const) {
                              const expiresAt = toNumber(
                                  oidcClientTsUser.__oidc_spa_tokenResponse[propertyName]
                              );

                              if (expiresAt === undefined) {
                                  continue;
                              }

                              if (expiresAt === 0) {
                                  return INFINITY_TIME;
                              }

                              return expiresAt * 1000;
                          }

                          for (const propertyName of [
                              "refresh_expires_in",
                              "refresh_token_expires_in"
                          ] as const) {
                              const expiresIn = toNumber(
                                  oidcClientTsUser.__oidc_spa_tokenResponse[propertyName]
                              );

                              if (expiresIn === undefined) {
                                  continue;
                              }

                              if (expiresIn === 0) {
                                  return INFINITY_TIME;
                              }

                              return issuedAtTime + expiresIn * 1000;
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

        if (exports_DPoP !== undefined) {
            exports_DPoP.registerAccessTokenForDPoP({
                configId,
                accessToken: tokens.accessToken,
                paramsOfCreateGetServerDateNow
            });
        }

        if (exports_tokenSubstitution !== undefined) {
            const placeholders = exports_tokenSubstitution.getTokensPlaceholders({
                configId,
                tokens
            });

            tokens.accessToken = placeholders.accessToken;
            tokens.idToken = placeholders.idToken;
            tokens.refreshToken = placeholders.refreshToken;
        }

        if (
            isFirstCall &&
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

function toNumber(v: unknown): number | undefined {
    if (v === undefined || v === null) {
        return undefined;
    }
    if (typeof v === "string") {
        const v_n = parseFloat(v);

        assert(!isNaN(v_n), `3922033 ${v}`);

        return v_n;
    }

    assert(typeof v === "number", `2932202 ${v}`);

    return v;
}
