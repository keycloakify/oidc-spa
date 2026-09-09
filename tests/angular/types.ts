import type { Signal } from "@angular/core";
import type { GetOidc as GetOidc_react } from "../../src/react-spa/types";
import type { Oidc as Oidc_core } from "../../src/core";
import { oidcSpa, type CreateUser, type InjectOidc, type GetOidc } from "../../src/angular";
import { assert, type Equals } from "../../src/tools/tsafe/assert";

type User = { displayName: string };
assert<Equals<GetOidc<User>, GetOidc_react<User>>>();
const createUser: CreateUser<User> = () => ({ displayName: "Alice" });
const base = oidcSpa.withUser({ createUser, user_mock: { displayName: "Mock" } });
const { injectOidc, getOidc, provideOidc } = base.createUtils();

// Never invoked: verify consumer narrowing through the public API.
export async function checkTypes() {
    const oidc = injectOidc();
    assert<Equals<typeof oidc, InjectOidc.Oidc<User>>>();
    const { isUserLoggedIn, user, login } = oidc;
    if (isUserLoggedIn) {
        assert<Equals<typeof user, Signal<User>>>();
        assert<Equals<ReturnType<typeof user>, User>>();
    } else {
        assert<Equals<typeof login, InjectOidc.Oidc.NotLoggedIn["login"]>>();
    }
    const loggedIn = injectOidc({ assert: "user logged in" });
    assert<Equals<typeof loggedIn, InjectOidc.Oidc.LoggedIn<User>>>();
    assert<Equals<Awaited<ReturnType<typeof loggedIn.getAccessToken>>, string>>();
    assert<Equals<Awaited<ReturnType<typeof loggedIn.refreshUser>>, User>>();
    const loggedOut = injectOidc({ assert: "user not logged in" });
    assert<Equals<typeof loggedOut, InjectOidc.Oidc.NotLoggedIn>>();
    // @ts-expect-error logged-out consumers cannot read the user
    loggedOut.user();
    // @ts-expect-error assertions narrow unavailable methods away
    loggedIn.login();
    // @ts-expect-error signals are read-only
    loggedIn.user.set({ displayName: "Bob" });
    // @ts-expect-error no decoded ID token observability in Angular
    loggedIn.decodedIdToken;
    // @ts-expect-error no built-in RxJS user stream
    loggedIn.user$;

    const imperative = await getOidc();
    assert<Equals<typeof imperative, GetOidc.Oidc<User>>>();
    const { isUserLoggedIn: isLoggedIn, subscribeToTokenRotation } = imperative;
    if (isLoggedIn) {
        const { unsubscribeFromTokenRotation } = subscribeToTokenRotation(
            ({ accessToken, decodedIdToken }) => {
                assert<Equals<typeof accessToken, string>>();
                assert<Equals<typeof decodedIdToken, Oidc_core.Tokens.DecodedIdToken>>();
            }
        );
        unsubscribeFromTokenRotation();
    }
    const imperativeLoggedIn = await getOidc({ assert: "user logged in" });
    assert<
        Equals<ReturnType<typeof imperativeLoggedIn.getDecodedIdToken>, Oidc_core.Tokens.DecodedIdToken>
    >();
    // @ts-expect-error token rotation replaces the access-token-only subscription
    imperativeLoggedIn.subscribeToAccessTokenRotation;
    const result = await imperativeLoggedIn.getUser();
    assert<Equals<typeof result.user, User>>();
    const imperativeLoggedOut = await getOidc({ assert: "user not logged in" });
    assert<Equals<typeof imperativeLoggedOut, GetOidc.Oidc.NotLoggedIn>>();

    const autoLogin = base.withAutoLogin().createUtils();
    const alwaysLoggedIn = autoLogin.injectOidc();
    assert<Equals<typeof alwaysLoggedIn.isUserLoggedIn, true>>();
    assert<Equals<Awaited<ReturnType<typeof autoLogin.getOidc>>, GetOidc.Oidc.LoggedIn<User>>>();
    autoLogin.createOidcInterceptor({ shouldInjectAccessToken: () => true });
    const reordered = oidcSpa
        .withNonBlockingRendering()
        .withAutoLogin()
        .withUser({ createUser })
        .createUtils();
    assert<Equals<ReturnType<typeof reordered.injectOidc>, InjectOidc.Oidc.LoggedIn<User>>>();
    // @ts-expect-error auto-login has no login guard
    autoLogin.enforceLoginGuard;
    // @ts-expect-error auto-login cannot start an anonymous mock session
    autoLogin.provideOidc({ implementation: "mock", isUserInitiallyLoggedIn: false });
    provideOidc({
        implementation: "mock",
        isUserInitiallyLoggedIn: true,
        // @ts-expect-error user mocks must match the application model
        user_mock: { displayName: 123 }
    });
    // @ts-expect-error real versus mock must be explicit
    provideOidc({ issuerUri: "", clientId: "" });
    // @ts-expect-error autoLogin is a builder option
    provideOidc({ implementation: "real", issuerUri: "", clientId: "", autoLogin: true });
    provideOidc({
        implementation: "real",
        issuerUri: "",
        clientId: "",
        // @ts-expect-error Angular no longer accepts decodedIdTokenSchema
        decodedIdTokenSchema: { parse: () => ({}) }
    });
    // @ts-expect-error withUser can only be called once
    base.withUser({ createUser });
    // @ts-expect-error non-blocking rendering can only be selected once
    base.withNonBlockingRendering().withNonBlockingRendering();
    // @ts-expect-error withAutoLogin can only be called once
    base.withAutoLogin().withAutoLogin();
}

// @ts-expect-error mock values must not widen the inferred User type
oidcSpa.withUser({ createUser, user_mock: { displayName: 123 } });
