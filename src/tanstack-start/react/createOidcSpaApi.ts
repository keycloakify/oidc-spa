import type { CreateValidateAndGetAccessTokenClaims, OidcSpaApi } from "./types";
import type { ZodSchemaLike } from "../../tools/ZodSchemaLike";
import { Oidc as Oidc_core } from "../../core";

export function createOidcSpaApi<AutoLogin, DecodedIdToken, AccessTokenClaims>(params: {
    autoLogin: AutoLogin;
    decodedIdTokenSchema:
        | ZodSchemaLike<Oidc_core.Tokens.DecodedIdToken_OidcCoreSpec, DecodedIdToken>
        | undefined;
    decodedIdToken_mock: DecodedIdToken | undefined;
    createValidateAndGetAccessTokenClaims:
        | CreateValidateAndGetAccessTokenClaims<AccessTokenClaims>
        | undefined;
}): OidcSpaApi<AutoLogin, DecodedIdToken, AccessTokenClaims> {
    return null as any;
}
