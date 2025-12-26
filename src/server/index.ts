export type * from "./types";
import { oidcSpaUtilsBuilder } from "./utilsBuilder";
export { parseRequest, type AnyRequest, type ParseAnyRequestResult } from "./parseRequest";

export const oidcSpa = oidcSpaUtilsBuilder;
