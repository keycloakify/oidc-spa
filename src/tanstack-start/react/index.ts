export { __disableSsrIfLoginEnforced } from "./disableSsrIfLoginEnforced";
export { __withOidcSpaServerEntry } from "./withOidcSpaServerEntry";
export type * from "./types";
import { oidcSpaUtilsBuilder } from "./utilsBuilder";

export const oidcSpa = oidcSpaUtilsBuilder;
