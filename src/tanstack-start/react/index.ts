export { __disableSsrIfLoginEnforced } from "./disableSsrIfLoginEnforced";
export { __withOidcSpaServerEntry } from "./withOidcSpaServerEntry";
export type * from "./types";
import { oidcSpaApiBuilder } from "./apiBuilder";

export const oidcSpa = oidcSpaApiBuilder;
