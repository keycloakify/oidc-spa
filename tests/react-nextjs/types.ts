import type { ComponentProps } from "react";
import {
    oidcSpa,
    type OidcSpaUtils,
    type CreateClientUser,
    type Oidc_react,
    type RuntimeConfigs
} from "../../src/react-nextjs";
import { oidcSpa as oidcSpa_react, type OidcSpaUtils as OidcSpaUtils_react } from "../../src/react-spa";
import { assert, type Equals } from "../../src/tools/tsafe/assert";

type User = { displayName: string };

assert<Equals<typeof oidcSpa, typeof oidcSpa_react>>;
assert<Equals<OidcSpaUtils<User, false>, OidcSpaUtils_react<User, false>>>;
assert<Equals<OidcSpaUtils<User, true>, OidcSpaUtils_react<User, true>>>;

// Never invoked: exercise inference, overloads and builder ordering as a consumer.
export async function checkTypes() {
    // @ts-expect-error creating utilities requires a user factory and runtime configs
    oidcSpa.createUtils();
    // @ts-expect-error runtime configs require a user factory first
    oidcSpa.withRuntimeConfigs({ mode: "mock" });

    const createUser: CreateClientUser<User> = async ({ idTokenClaims, user_current }) => {
        assert<Equals<typeof user_current, User | undefined>>;
        return { displayName: String(idTokenClaims.name) };
    };
    const builder = oidcSpa.withUser(createUser);
    // @ts-expect-error creating utilities requires runtime configs
    builder.createUtils();
    const configured = builder.withRuntimeConfigs({ mode: "mock", isUserInitiallyLoggedIn: false });
    const utils = configured.createUtils();
    assert<Equals<typeof utils, OidcSpaUtils<User, false>>>;
    assert<Equals<ReturnType<typeof utils.useOidc>, Oidc_react.NotLoggedIn>>;
    const loggedIn = utils.useOidc({ assert: "user logged in" });
    assert<Equals<typeof loggedIn.user, User>>;
    const loggedOut = utils.useOidc({ assert: "user not logged in" });
    assert<Equals<typeof loggedOut, Oidc_react.NotLoggedIn>>;
    loggedOut.login({ doesCurrentHrefEnforceLogin: true });
    const oidc = await utils.getOidc();
    if (oidc.isUserLoggedIn) {
        const user = await oidc.getUser();
        assert<Equals<typeof user, User>>;
    }

    utils.enforceLogin({ location: { href: "/private" }, cause: "enter" });
    const Guarded = utils.withLoginEnforced((props: { greeting: string }) => props.greeting);
    assert<Equals<ComponentProps<typeof Guarded>, { greeting: string }>>;
    // @ts-expect-error guarded components retain their required props
    Guarded({});
    // @ts-expect-error withUser can only be called once
    builder.withUser(createUser);
    // @ts-expect-error the user factory must match the explicit user type
    oidcSpa.withUser<User>(() => ({ displayName: 123 }));
    // @ts-expect-error runtime configs use mode rather than implementation
    builder.withRuntimeConfigs({ implementation: "mock" });

    const explicit = oidcSpa
        .withUser<User>(createUser)
        .withRuntimeConfigs(() => ({ mode: "mock" }))
        .createUtils();
    assert<Equals<typeof explicit, typeof utils>>;
    const inferred = oidcSpa
        .withUser(async () => ({ displayName: "Alice" }))
        .withRuntimeConfigs(async (): Promise<RuntimeConfigs> => ({ mode: "mock" }))
        .createUtils();
    assert<Equals<typeof inferred, typeof utils>>;

    const autoLogin = configured.withAutoLogin().createUtils();
    const reordered = oidcSpa
        .withAutoLogin()
        .withUser(createUser)
        .withRuntimeConfigs({ mode: "mock" })
        .createUtils();
    const beforeConfigs = builder.withAutoLogin().withRuntimeConfigs({ mode: "mock" }).createUtils();
    assert<Equals<typeof autoLogin, OidcSpaUtils<User, true>>>;
    assert<Equals<typeof reordered, typeof autoLogin>>;
    assert<Equals<typeof beforeConfigs, typeof autoLogin>>;
    assert<Equals<ReturnType<typeof autoLogin.useOidc>, Oidc_react.LoggedIn<User>>>;
    autoLogin.OidcInitializationErrorGate({ children: null, errorComponent: () => null });
    // @ts-expect-error auto-login has no manual login enforcement
    autoLogin.withLoginEnforced;
    // @ts-expect-error auto-login has no manual login enforcement
    autoLogin.enforceLogin;
    // @ts-expect-error withAutoLogin can only be called once
    configured.withAutoLogin().withAutoLogin();
    // @ts-expect-error withUser stays excluded after withAutoLogin
    configured.withAutoLogin().withUser(createUser);
}
