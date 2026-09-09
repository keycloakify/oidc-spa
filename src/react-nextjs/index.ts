"use client";

export * from "../react-spa";
export type { OidcSpaUtils } from "./types";
import { oidcSpa as oidcSpa_react } from "../react-spa";
import type { OidcSpaUtilsBuilder as OidcSpaUtilsBuilder_react } from "../react-spa/utilsBuilder";
import type { OidcSpaUtils } from "./types";
import { adaptOidcSpaUtils } from "./adaptOidcSpaUtils";
import { assert, type Equals } from "../tools/tsafe/assert";

type WithUser<User> = typeof oidcSpa_react.withUser<User>;

type OidcSpaUtilsBuilder<
    User,
    AutoLogin,
    ExcludedMethod extends keyof typeof oidcSpa_react = never
> = Omit<
    {
        withAutoLogin: (
            ...args: Parameters<OidcSpaUtilsBuilder_react<User, AutoLogin>["withAutoLogin"]>
        ) => OidcSpaUtilsBuilder<User, true, ExcludedMethod | "withAutoLogin">;
        withUser: <User>(
            ...args: Parameters<WithUser<User>>
        ) => OidcSpaUtilsBuilder<User, AutoLogin, ExcludedMethod | "withUser">;
        createUtils: (
            ...args: Parameters<OidcSpaUtilsBuilder_react<User, AutoLogin>["createUtils"]>
        ) => OidcSpaUtils<User, AutoLogin>;
    },
    ExcludedMethod
>;

// Generic builder methods need explicit return types to keep User inference and chaining.
// Fail the build if React adds a builder method that also needs wrapping here.
assert<Equals<keyof OidcSpaUtilsBuilder<never, false>, keyof typeof oidcSpa_react>>;

function adaptBuilder<User, AutoLogin, ExcludedMethod extends keyof typeof oidcSpa_react>(
    builder: OidcSpaUtilsBuilder_react<User, AutoLogin, ExcludedMethod>
): OidcSpaUtilsBuilder<User, AutoLogin, ExcludedMethod> {
    // React hides already-used methods in its types but keeps them at runtime.
    const builder_base = builder as OidcSpaUtilsBuilder_react<User, AutoLogin>;

    const adapted: OidcSpaUtilsBuilder<User, AutoLogin> = {
        ...builder,
        withAutoLogin: (...args) => adaptBuilder(builder_base.withAutoLogin(...args)),
        withUser: <User>(...args: Parameters<WithUser<User>>) =>
            adaptBuilder(builder_base.withUser<User>(...args)),
        createUtils: (...args) => adaptOidcSpaUtils(builder_base.createUtils(...args))
    };

    return adapted as OidcSpaUtilsBuilder<User, AutoLogin, ExcludedMethod>;
}

export const oidcSpa = adaptBuilder(oidcSpa_react);
