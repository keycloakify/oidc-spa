import type { Component, mount } from "svelte";
import type { Oidc, OidcInitializationError } from "..";

export type OidcProviderOidcProps<AutoLogin extends boolean> = AutoLogin extends true
    ? {
          Fallback?: Component;
          ErrorFallback?: Component<{ initializationError: OidcInitializationError }>;
      }
    : { Fallback?: Component; ErrorFallback?: never };

// Assumes Svelte mount signature: mount(component: Component, options: { target: Element, props?: Record<string, any> })
export type OidcProviderProps<
    DecodedIdToken extends Record<string, unknown>,
    AutoLogin extends boolean
> = {
    App: Parameters<typeof mount>[0];
    appProps: Parameters<typeof mount>[1]["props"];
    oidcOrInitializationError: OidcInitializationError | Oidc<DecodedIdToken> | undefined;
    oidcProps?: OidcProviderOidcProps<AutoLogin>;
};
