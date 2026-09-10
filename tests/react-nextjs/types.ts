import type { ComponentProps } from "react";
import { oidcSpa, type OidcSpaUtils, type CreateUser, type UseOidc } from "../../src/react-nextjs";
import type { OidcSpaUtils as OidcSpaUtils_react } from "../../src/react-spa";
import { assert, type Equals } from "../../src/tools/tsafe/assert";

type User = { displayName: string };

assert<Equals<OidcSpaUtils<User, false>, Omit<OidcSpaUtils_react<User, false>, "enforceLogin">>>;
assert<Equals<OidcSpaUtils<User, true>, Omit<OidcSpaUtils_react<User, true>, "enforceLogin">>>;

// Never invoked: exercise inference, overloads and both builder orders as a consumer.
export async function checkTypes() {
    const plain = oidcSpa.createUtils();
    assert<Equals<typeof plain, OidcSpaUtils<never, false>>>;
    // @ts-expect-error Next.js only exposes component-based login enforcement
    plain.enforceLogin;

    const createUser: CreateUser<User> = async () => ({ displayName: "Alice" });
    const builder = oidcSpa.withUser({ createUser, user_mock: { displayName: "Mock" } });
    const utils = builder.createUtils();
    assert<Equals<typeof utils, OidcSpaUtils<User, false>>>;
    assert<Equals<ReturnType<typeof utils.useOidc>, UseOidc.Oidc.NotLoggedIn>>;
    const loggedIn = utils.useOidc({ assert: "user logged in" });
    assert<Equals<typeof loggedIn.user, User>>;
    const loggedOut = utils.useOidc({ assert: "user not logged in" });
    assert<Equals<typeof loggedOut, UseOidc.Oidc.NotLoggedIn>>;
    const oidc = await utils.getOidc();
    if (oidc.isUserLoggedIn) {
        const { user } = await oidc.getUser();
        assert<Equals<typeof user, User>>;
    }

    const Guarded = utils.withLoginEnforced((props: { greeting: string }) => props.greeting);
    assert<Equals<ComponentProps<typeof Guarded>, { greeting: string }>>;
    // @ts-expect-error guarded components retain their required props
    Guarded({});
    // @ts-expect-error withUser can only be called once
    builder.withUser({ createUser });
    // @ts-expect-error mocks must not widen the inferred user type
    oidcSpa.withUser({ createUser, user_mock: { displayName: 123 } });

    const explicit = oidcSpa.withUser<User>({ createUser }).createUtils();
    assert<Equals<typeof explicit, typeof utils>>;
    const autoLogin = builder.withAutoLogin().createUtils();
    const reordered = oidcSpa.withAutoLogin().withUser({ createUser }).createUtils();
    assert<Equals<typeof autoLogin, OidcSpaUtils<User, true>>>;
    assert<Equals<typeof reordered, typeof autoLogin>>;
    assert<Equals<ReturnType<typeof autoLogin.useOidc>, UseOidc.Oidc.LoggedIn<User>>>;
    autoLogin.OidcInitializationErrorGate({ children: null, errorComponent: () => null });
    // @ts-expect-error auto-login has no manual login enforcement
    autoLogin.withLoginEnforced;
    // @ts-expect-error Next.js never exposes enforceLogin
    autoLogin.enforceLogin;
    // @ts-expect-error withAutoLogin can only be called once
    builder.withAutoLogin().withAutoLogin();
    // @ts-expect-error withUser stays excluded after withAutoLogin
    builder.withAutoLogin().withUser({ createUser });
    // @ts-expect-error auto-login cannot start an anonymous mock session
    autoLogin.bootstrapOidc({ implementation: "mock", isUserInitiallyLoggedIn: false });
}
