import type { ComputedRef, ShallowRef } from "vue";
import type { GetOidc, Oidc_react } from "../../src/react/types";
import {
    oidcSpa,
    OidcInitializationError,
    type Oidc,
    type Oidc_vue,
    type OidcSpaUtils,
    type CreateClientUser,
    type RuntimeConfigs,
    type AutoLogoutState
} from "../../src/vue";
import { assert, type Equals } from "../../src/tools/tsafe/assert";

type User = { displayName: string };

assert<Equals<keyof Oidc_vue<User>, Exclude<keyof Oidc_react<User>, "suspensePromise">>>();
assert<Equals<OidcSpaUtils<User>["getOidc"], GetOidc<User>>>();
assert<
    Equals<
        Omit<Oidc_vue.LoggedIn<User>, "user" | "autoLogoutState">,
        Omit<Oidc_react.LoggedIn<User>, "user" | "autoLogoutState">
    >
>();
assert<
    Equals<
        Omit<Oidc_vue.NotLoggedIn, "autoLogoutState">,
        Omit<Oidc_react.NotLoggedIn, "autoLogoutState">
    >
>();

// Never invoked: check the builder, public utilities and discriminated unions.
export async function checkTypes() {
    // @ts-expect-error a user factory is required first
    oidcSpa.withRuntimeConfigs({ mode: "mock" });
    // @ts-expect-error utilities require a user factory and runtime configs
    oidcSpa.createUtils();

    const createUser: CreateClientUser<User> = async ({ isMock, user_current }) => {
        assert<Equals<typeof isMock, boolean>>;
        assert<Equals<typeof user_current, User | undefined>>;
        return { displayName: "Alice" };
    };
    const builder = oidcSpa.withUser(createUser);
    // @ts-expect-error a user factory can only be specified once
    builder.withUser(createUser);
    // @ts-expect-error runtime configs are required
    builder.createUtils();
    const utils = builder.withRuntimeConfigs({ mode: "mock" }).createUtils();
    assert<Equals<typeof utils, OidcSpaUtils<User>>>;
    assert<Equals<keyof typeof utils, "useOidc" | "getOidc" | "enforceLogin">>;
    const inferred = oidcSpa
        .withUser(async () => ({ displayName: "Alice" }))
        .withRuntimeConfigs(async (): Promise<RuntimeConfigs> => ({ mode: "mock" }))
        .createUtils();
    assert<Equals<typeof inferred, typeof utils>>;

    const oidc = await utils.getOidc();
    assert<Equals<typeof oidc, Oidc<User>>>;
    const loggedIn = await utils.getOidc({ assert: "user logged in" });
    assert<Equals<typeof loggedIn, Oidc.LoggedIn<User>>>;
    const loggedOut = await utils.getOidc({ assert: "user not logged in" });
    assert<Equals<typeof loggedOut, Oidc.NotLoggedIn>>;

    const stateRef = utils.useOidc();
    assert<Equals<typeof stateRef.value, Oidc_vue<User>>>;
    const { autoLogoutState, initializationError, isOidcReady: ready } = stateRef;
    assert<Equals<typeof autoLogoutState, ComputedRef<AutoLogoutState>>>;
    assert<Equals<typeof initializationError, ComputedRef<OidcInitializationError | undefined>>>;
    assert<Equals<typeof ready, ComputedRef<boolean>>>;
    assert<Equals<typeof stateRef.user, ComputedRef<User | undefined>>>;
    assert<Equals<typeof stateRef.login, ComputedRef<Oidc_vue.NotLoggedIn["login"] | undefined>>>;
    // @ts-expect-error consumers cannot replace the warning state
    autoLogoutState.value = { shouldDisplayWarning: false };
    const state = stateRef.value;
    if (!state.isOidcReady) {
        assert<Equals<typeof state.initializationError, OidcInitializationError | undefined>>;
        assert<Equals<typeof state.isUserLoggedIn, undefined>>;
    } else if (state.isUserLoggedIn) {
        assert<Equals<typeof state.user.value, User>>;
        assert<Equals<typeof state.initializationError, undefined>>;
    } else {
        assert<Equals<typeof state.initializationError, OidcInitializationError | undefined>>;
        assert<Equals<typeof state.user, undefined>>;
    }
    const { isUserLoggedIn, user } = stateRef.value;
    if (isUserLoggedIn) {
        assert<Equals<typeof user.value, User>>;
        user.value.displayName.toUpperCase();
    } else {
        assert<Equals<typeof user, undefined>>;
    }
    // @ts-expect-error reading the user requires narrowing the logged-in state
    user.value.displayName;
    const authenticated = utils.useOidc({ assert: "user logged in" });
    assert<Equals<typeof authenticated.user, Readonly<ShallowRef<User>>>>;
    assert<Equals<typeof authenticated.autoLogoutState, Readonly<ShallowRef<AutoLogoutState>>>>;
    // @ts-expect-error consumers cannot replace the user ref
    authenticated.user.value = { displayName: "Bob" };
    // @ts-expect-error consumers cannot replace the auto-logout ref
    authenticated.autoLogoutState.value = { shouldDisplayWarning: false };
    const anonymous = utils.useOidc({ assert: "user not logged in" });
    assert<Equals<typeof anonymous.isUserLoggedIn, false>>;
    anonymous.login();
    // @ts-expect-error the composable login does not expose the guard option
    anonymous.login({ doesCurrentHrefEnforceLogin: true });

    await utils.enforceLogin({ fullPath: "/account" });
    // @ts-expect-error pass the route object, not a URL string
    utils.enforceLogin("https://app.test/account");
}
