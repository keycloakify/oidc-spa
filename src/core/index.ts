export type { Oidc } from "./Oidc";
export { createOidc, type ParamsOfCreateOidc } from "./createOidc";
export { OidcInitializationError } from "./OidcInitializationError";
export { oidcEarlyInit } from "./earlyInit";
export type CreateUser<User> = import("./createOidc").ParamsOfCreateOidc.CreateUser<User>;

export type IdTokenClaims = {
    // REQUIRED
    iss: string; // Issuer Identifier
    sub: string; // Subject Identifier
    aud: string | string[]; // Audience(s)
    exp: number; // Expiration time (Unix seconds)
    iat: number; // Issued-at time (Unix seconds)

    // CONDITIONAL
    auth_time?: number; // Authentication time
    nonce?: string; // Nonce
    acr?: string; // Authentication Context Class Reference
    amr?: string[]; // Authentication Methods References
    azp?: string; // Authorized party (for multiple audiences)

    // OPTIONAL standard user claims (OpenID §5.1)
    name?: string;
    given_name?: string;
    family_name?: string;
    middle_name?: string;
    nickname?: string;
    preferred_username?: string;
    profile?: string;
    picture?: string;
    website?: string;
    email?: string;
    email_verified?: boolean;
    gender?: string;
    birthdate?: string;
    zoneinfo?: string;
    locale?: string;
    phone_number?: string;
    phone_number_verified?: boolean;
    address?: Record<string, unknown>;
    updated_at?: number;

    [claimName: string]: unknown;
};
