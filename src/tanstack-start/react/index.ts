export { withHandlingOidcPostLoginNavigation } from "./withHandlingOidcPostLoginNavigation";
export { __disableSsrIfLoginEnforced } from "./disableSsrIfLoginEnforced";
export type * from "./types";
import { oidcSpaApiBuilder } from "./apiBuilder";

export const oidcSpa = oidcSpaApiBuilder;
