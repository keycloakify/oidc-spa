import { createReactOidc_dependencyInjection } from "../react/react";
import { createMockOidc, type ParamsOfCreateMockOidc } from "./oidc";

export function createMockReactOidc<
    DecodedIdToken extends Record<string, unknown> = Record<string, unknown>
>(params: ParamsOfCreateMockOidc<DecodedIdToken>) {
    return createReactOidc_dependencyInjection(params, createMockOidc);
}
