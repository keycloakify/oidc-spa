export type { Oidc } from "./Oidc";
export { createOidc, type ParamsOfCreateOidc } from "./createOidc";
export { OidcInitializationError } from "./OidcInitializationError";
export { oidcEarlyInit } from "./earlyInit";
export type CreateUser<User> = import("./createOidc").ParamsOfCreateOidc.CreateUser<User>;
export type { OidcUserInfo } from "../tools/OidcUserInfo";

export type IdTokenClaims = import("./Oidc").Oidc.Tokens.DecodedIdToken;
