import type { ComponentProps } from "react";
import {
    oidcSpa,
    type OidcSpaUtils,
    type CreateClientUser,
    type OidcInitializationError,
    type Oidc,
    type Oidc_react,
    type RuntimeConfigs
} from "../../src/react-nextjs";
import { oidcSpa as oidcSpa_react, type OidcSpaUtils as OidcSpaUtils_react } from "../../src/react-spa";
import { assert, type Equals } from "../../src/tools/tsafe/assert";

type User = { displayName: string };

assert<Equals<typeof oidcSpa, typeof oidcSpa_react>>;
assert<Equals<OidcSpaUtils<User>, OidcSpaUtils_react<User>>>;

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
    assert<Equals<typeof utils, OidcSpaUtils<User>>>;
    assert<Equals<ReturnType<typeof utils.useOidc>, Oidc_react.NotLoggedIn>>;
    const loggedIn = utils.useOidc({ assert: "user logged in" });
    assert<Equals<typeof loggedIn.user, User>>;
    const loggedOut = utils.useOidc({ assert: "user not logged in" });
    assert<Equals<typeof loggedOut, Oidc_react.NotLoggedIn>>;
    loggedOut.login({ doesCurrentHrefEnforceLogin: true });
    const oidc = await utils.getOidc();
    assert<Equals<typeof oidc, Oidc<User>>>;
    if (oidc.isUserLoggedIn) {
        const user = await oidc.getUser();
        assert<Equals<typeof user, User>>;
    }

    utils.enforceLogin({ location: { href: "/private" }, cause: "enter" });
    const Guarded = utils.withLoginEnforced({
        component: (props: { greeting: string }) => props.greeting,
        errorComponent: ({ oidcInitializationError }) => {
            assert<Equals<typeof oidcInitializationError, OidcInitializationError>>;
            return oidcInitializationError.message;
        }
    });
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

    // @ts-expect-error auto-login mode has been removed
    configured.withAutoLogin();
    // @ts-expect-error initialization errors are handled by page protection
    utils.OidcInitializationErrorGate;
    // @ts-expect-error page protection takes an options object
    utils.withLoginEnforced((props: { greeting: string }) => props.greeting);
}
