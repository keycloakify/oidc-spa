import type { Signal } from "@angular/core";
import type { GetOidc as GetOidc_client } from "../../src/client/types";
import type { GetOidc as GetOidc_vue } from "../../src/vue/types";
import type {
    GetOidc as GetOidc_react,
    RuntimeConfigs as RuntimeConfigs_react,
    CreateClientUser as CreateClientUser_react,
    Oidc_react
} from "../../src/react/types";
import {
    oidcSpa,
    type CreateClientUser,
    type InjectOidc,
    type GetOidc,
    type RuntimeConfigs,
    type Oidc_angular,
    type Oidc,
    type OidcTokens,
    type IdTokenClaims,
    OidcInitializationError
} from "../../src/angular";
import { assert, type Equals } from "../../src/tools/tsafe/assert";

type User = { displayName: string };
assert<Equals<GetOidc<User>, GetOidc_react<User>>>();
assert<Equals<GetOidc<User>, GetOidc_client<User>>>();
assert<Equals<GetOidc<User>, GetOidc_vue<User>>>();
assert<Equals<RuntimeConfigs, RuntimeConfigs_react>>();
assert<Equals<CreateClientUser<User>, CreateClientUser_react<User>>>();
assert<
    Equals<
        Omit<Oidc_angular.LoggedIn<User>, "user" | "autoLogoutState">,
        Omit<Oidc_react.LoggedIn<User>, "user" | "autoLogoutState">
    >
>();
assert<
    Equals<
        ReturnType<Oidc_angular.LoggedIn<User>["autoLogoutState"]>,
        Oidc_react.LoggedIn<User>["autoLogoutState"]
    >
>();
assert<
    Equals<
        Omit<Oidc_angular.NotLoggedIn, "autoLogoutState">,
        Omit<Oidc_react.NotLoggedIn, "autoLogoutState">
    >
>();
const createUser: CreateClientUser<User> = ({ isMock, idTokenClaims, user_current }) => {
    assert<Equals<typeof isMock, boolean>>();
    assert<Equals<typeof idTokenClaims, IdTokenClaims>>();
    assert<Equals<typeof user_current, User | undefined>>();
    return { displayName: "Alice" };
};
const base = oidcSpa.withUser(createUser);
const { injectOidc, getOidc, provideOidc } = base.createUtils();

// Never invoked: verify consumer narrowing and the public API at compile time.
export async function checkTypes() {
    const oidc = injectOidc();
    assert<Equals<typeof oidc, Oidc_angular<User>>>();
    const { isOidcReady, isUserLoggedIn, user, login } = oidc;
    if (isUserLoggedIn) {
        assert<Equals<typeof user, Signal<User>>>();
    } else if (isOidcReady) {
        assert<Equals<typeof login, Oidc_angular.NotLoggedIn["login"]>>();
    } else {
        assert<Equals<typeof isUserLoggedIn, undefined>>();
        assert<Equals<typeof login, undefined>>();
    }
    const loggedIn = injectOidc({ assert: "user logged in" });
    assert<Equals<typeof loggedIn, Oidc_angular.LoggedIn<User>>>();
    assert<Equals<Awaited<ReturnType<typeof loggedIn.refreshUser>>, void>>();
    loggedIn.startAuthorization({ authorizationParams: { resource: ["one", "two"] }, returnToUrl: "/" });
    loggedIn.logout({ returnToUrl: "/" });
    // @ts-expect-error tokens belong to the imperative core API, as in React
    loggedIn.getAccessToken();
    // @ts-expect-error signals are read-only
    loggedIn.user.set({ displayName: "Bob" });
    // @ts-expect-error old authorization API was removed
    loggedIn.goToAuthServer();
    const loggedOut = injectOidc({ assert: "user not logged in" });
    assert<Equals<typeof loggedOut, Oidc_angular.NotLoggedIn>>();
    assert<Equals<typeof loggedOut.initializationError, OidcInitializationError | undefined>>();
    loggedOut.login({});
    loggedOut.login({ returnToUrl: "/" });
    // @ts-expect-error UI login does not expose the route guard option
    loggedOut.login({ doesCurrentHrefEnforceLogin: true });
    // @ts-expect-error old login parameters were removed
    loggedOut.login({ redirectUrl: "/" });
    // @ts-expect-error logged-out consumers cannot read the user
    loggedOut.user();

    const imperative = await getOidc();
    assert<Equals<typeof imperative, Oidc<User>>>();
    const imperativeLoggedIn = await getOidc({ assert: "user logged in" });
    assert<Equals<Awaited<ReturnType<typeof imperativeLoggedIn.getUser>>, User>>();
    assert<Equals<Awaited<ReturnType<typeof imperativeLoggedIn.refreshUser>>, void>>();
    imperativeLoggedIn.getTokens({ scopes: ["email"], returnToUrl: "/" });
    imperativeLoggedIn.getAccessToken({ authorizationParams: { audience: "api" } });
    imperativeLoggedIn.subscribeToTokensChange(tokens => {
        assert<Equals<typeof tokens, OidcTokens>>();
    });
    imperativeLoggedIn.subscribeToUserChange(({ user }) => {
        assert<Equals<typeof user, User>>();
    });
    // @ts-expect-error legacy adapter-specific token API was removed
    imperativeLoggedIn.subscribeToTokenRotation;
    // @ts-expect-error claims are exposed through getTokens()
    imperativeLoggedIn.getDecodedIdToken();
    const utils = base.createUtils();
    utils.enforceLoginGuard({} as Parameters<typeof utils.enforceLoginGuard>[0]);
    // @ts-expect-error initialization errors are available on injectOidc()
    base.createUtils().injectOidcInitializationError;
    assert<Equals<typeof utils.injectOidc, InjectOidc<User>>>();
    assert<Equals<typeof utils.getOidc, GetOidc<User>>>();

    provideOidc({ mode: "mock" });
    provideOidc({
        mode: "mock",
        isUserInitiallyLoggedIn: false,
        idTokenClaims_mock: { iss: "", sub: "", aud: "", exp: 1, iat: 1, name: "Alice" }
    });
    provideOidc(async () => ({
        mode: "real",
        issuerUri: "",
        clientId: "",
        sessionRestorationMethod: "foreground redirect"
    }));
    // @ts-expect-error the discriminant is now mode
    provideOidc({ implementation: "mock" });
    // @ts-expect-error runtime configs are provided by Angular, not the builder
    base.withRuntimeConfigs({ mode: "mock" });
    // @ts-expect-error a user factory is required, as in React
    oidcSpa.createUtils();
    // @ts-expect-error withUser takes a factory directly
    oidcSpa.withUser({ createUser });
    // @ts-expect-error withUser can only be called once
    base.withUser(createUser);
    // @ts-expect-error rendering is non-blocking by default
    base.withNonBlockingRendering();
    // @ts-expect-error auto-login mode has been removed
    base.withAutoLogin();
    // @ts-expect-error user mocking is handled inside the factory
    provideOidc({ mode: "mock", user_mock: { displayName: "Alice" } });
}
