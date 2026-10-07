export type * from "../react-spa";
import type { OidcSpaUtils as OidcSpaUtils_react } from "../react-spa";

export type OidcSpaUtils<User, AutoLogin> = Omit<OidcSpaUtils_react<User, AutoLogin>, "enforceLogin">;
