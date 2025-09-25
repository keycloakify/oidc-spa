import { createAngularOidc_dependencyInjection } from "../angular/angular";
import { createMockOidc, type ParamsOfCreateMockOidc } from "./oidc";
import type { ValueOrAsyncGetter } from "../tools/ValueOrAsyncGetter";

/** @see: https://docs.oidc-spa.dev/v/v8/mock */
export function createMockAngularOidc<
    DecodedIdToken extends Record<string, unknown> = Record<string, unknown>,
    AutoLogin extends boolean = false
>(params: ValueOrAsyncGetter<ParamsOfCreateMockOidc<DecodedIdToken, AutoLogin>>) {
    return createAngularOidc_dependencyInjection(params, createMockOidc);
}
