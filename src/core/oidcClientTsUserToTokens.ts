import type { User as OidcClientTsUser } from "../vendor/frontend/oidc-client-ts-and-jwt-decode";
import { assert, id } from "../vendor/frontend/tsafe";
import { readExpirationTimeInJwt } from "../tools/readExpirationTimeInJwt";
import { decodeJwt } from "../tools/decodeJwt";
import type { Oidc } from "./Oidc";

export function oidcClientTsUserToTokens<DecodedIdToken extends Record<string, unknown>>(params: {
    oidcClientTsUser: OidcClientTsUser;
    decodedIdTokenSchema?: { parse: (data: unknown) => DecodedIdToken };
    __unsafe_useIdTokenAsAccessToken: boolean;
    decodedIdToken_previous: DecodedIdToken | undefined;
    log: typeof console.log | undefined;
}): Oidc.Tokens<DecodedIdToken> {
    const {
        oidcClientTsUser,
        decodedIdTokenSchema,
        __unsafe_useIdTokenAsAccessToken,
        decodedIdToken_previous,
        log
    } = params;

    const isFirstInit = decodedIdToken_previous === undefined;

    const accessToken = oidcClientTsUser.access_token;

    const accessTokenExpirationTime = (() => {
        read_from_token_response: {
            const { expires_at } = oidcClientTsUser;

            if (expires_at === undefined) {
                break read_from_token_response;
            }

            return expires_at * 1000;
        }

        read_from_jwt: {
            const expirationTime = readExpirationTimeInJwt(accessToken);

            if (expirationTime === undefined) {
                break read_from_jwt;
            }

            return expirationTime;
        }

        assert(false, "Failed to get access token expiration time");
    })();

    const refreshToken = oidcClientTsUser.refresh_token;

    const refreshTokenExpirationTime = (() => {
        if (refreshToken === undefined) {
            return undefined;
        }

        read_from_jwt: {
            const expirationTime = readExpirationTimeInJwt(refreshToken);

            if (expirationTime === undefined) {
                break read_from_jwt;
            }

            return expirationTime;
        }

        return undefined;
    })();

    const idToken = oidcClientTsUser.id_token;

    assert(idToken !== undefined, "No id token provided by the oidc server");

    const decodedIdToken = (() => {
        let decodedIdToken = decodeJwt(idToken) as DecodedIdToken;

        if (isFirstInit) {
            log?.(
                [
                    `Decoded ID token`,
                    decodedIdTokenSchema === undefined ? "" : " before `decodedIdTokenSchema.parse()`\n",
                    JSON.stringify(decodedIdToken, null, 2)
                ].join("")
            );
        }

        if (decodedIdTokenSchema !== undefined) {
            decodedIdToken = decodedIdTokenSchema.parse(decodedIdToken);

            if (isFirstInit) {
                log?.(
                    [
                        "Decoded ID token after `decodedIdTokenSchema.parse()`\n",
                        JSON.stringify(decodedIdToken, null, 2)
                    ].join("")
                );
            }
        }

        if (
            decodedIdToken_previous !== undefined &&
            JSON.stringify(decodedIdToken) === JSON.stringify(decodedIdToken_previous)
        ) {
            return decodedIdToken_previous;
        }

        return decodedIdToken;
    })();

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
            : { accessToken, accessTokenExpirationTime }),
        idToken,
        decodedIdToken
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
                  refreshTokenExpirationTime
              });

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

export function getMsBeforeExpiration(tokens: Oidc.Tokens): number {
    // NOTE: In general the access token is supposed to have a shorter
    // lifespan than the refresh token but we don't want to make any
    // assumption here.
    const tokenExpirationTime = Math.min(
        tokens.accessTokenExpirationTime,
        tokens.refreshTokenExpirationTime ?? Number.POSITIVE_INFINITY
    );

    const msBeforeExpiration = Math.min(
        tokenExpirationTime - Date.now(),
        // NOTE: We want to make sure we do not overflow the setTimeout
        // that must be a 32 bit unsigned integer.
        // This can happen if the tokenExpirationTime is more than 24.8 days in the future.
        Math.pow(2, 31) - 1
    );

    if (msBeforeExpiration < 0) {
        return 0;
    }

    return msBeforeExpiration;
}
