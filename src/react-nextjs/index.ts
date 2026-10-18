"use client";

export * from "../react-spa";
import { oidcSpa as oidcSpa_react } from "../react-spa";
import type { OidcSpa } from "../react-spa/oidcSpa";
import { adaptOidcSpaUtils } from "./adaptOidcSpaUtils";

type CompleteBuilder = typeof oidcSpa_react & OidcSpa<unknown, false, "withUser" | "withRuntimeConfigs">;

function adaptBuilder<Builder>(builder: Builder): Builder {
    // React hides already-used methods in its types but keeps them at runtime.
    // Preserve the original builder type, including generic inference and chaining.
    const builder_base = builder as Builder & CompleteBuilder;

    return {
        ...builder,
        withAutoLogin: () => adaptBuilder(builder_base.withAutoLogin()),
        withUser: (...args: Parameters<CompleteBuilder["withUser"]>) =>
            adaptBuilder(builder_base.withUser(...args)),
        withRuntimeConfigs: (...args: Parameters<CompleteBuilder["withRuntimeConfigs"]>) =>
            adaptBuilder(builder_base.withRuntimeConfigs(...args)),
        createUtils: () => adaptOidcSpaUtils(builder_base.createUtils())
    };
}

export const oidcSpa = adaptBuilder(oidcSpa_react);
