export type * from "./types";
import { oidcSpaUtilsBuilder } from "./utilsBuilder";
export {
    extractRequestAuthContext,
    type AnyRequest,
    type RequestAuthContext as ParseAnyRequestResult
} from "./extractRequestAuthContext";

export const oidcSpa = oidcSpaUtilsBuilder;
