import type { STATE_QUERY_PARAM_VALUE_IDENTIFIER_PREFIX as ofType_STATE_QUERY_PARAM_VALUE_IDENTIFIER_PREFIX } from "../../core/StateData";
import type { REDIRECT_URI_RESERVED_PATH as ofType_REDIRECT_URI_RESERVED_PATH } from "../../core/validRedirectUri";
import { id } from "../../tools/tsafe/id";

export const REDIRECT_URI_RESERVED_PATH =
    id<typeof ofType_REDIRECT_URI_RESERVED_PATH>("/openid-callback/");
export const STATE_QUERY_PARAM_VALUE_IDENTIFIER_PREFIX =
    id<typeof ofType_STATE_QUERY_PARAM_VALUE_IDENTIFIER_PREFIX>("b2lkYy1zcGEu");
export const BACKEND_PATHS = ["/api", "/api/*", "/_serverFn", "/_serverFn/*"];
