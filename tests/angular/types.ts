import { inject, Injector, type AbstractType } from "@angular/core";
import { oidcSpa, type CreateUser, type OidcService } from "../../src/angular";
import { assert, type Equals } from "../../src/tools/tsafe/assert";

type User = { displayName: string };
const createUser: CreateUser<User> = () => ({ displayName: "Alice" });
const base = oidcSpa.withUser({ createUser, user_mock: { displayName: "Mock" } });
const { Oidc } = base.createUtils();

// Never invoked: these assertions check the public API through Angular's own inference.
export async function checkTypes(injector: Injector) {
    const oidc = inject(Oidc);
    const fromInjector = injector.get(Oidc);
    const optional = inject(Oidc, { optional: true });
    const optionalFromInjector = injector.get(Oidc, null);
    assert<Equals<typeof optional, OidcService<false, User> | null>>();
    assert<Equals<typeof optionalFromInjector, OidcService<false, User> | null>>();
    assert<Equals<typeof oidc, OidcService<false, User>>>();
    assert<Equals<typeof fromInjector, OidcService<false, User>>>();
    assert<Equals<ReturnType<typeof oidc.$user>, User>>();
    const user = await oidc.refreshUser();
    assert<Equals<typeof user, User>>();
    const result = await oidc.getAccessToken();
    if (result.isUserLoggedIn) {
        assert<Equals<typeof result.accessToken, string>>();
    }
    const token: AbstractType<OidcService<false, User>> = Oidc;
    assert<Equals<ReturnType<typeof token.toString>, string>>();

    const { Oidc: OidcWithAutoLogin } = base.withAutoLogin().createUtils();
    const loggedIn = inject(OidcWithAutoLogin);
    assert<Equals<typeof loggedIn.isUserLoggedIn, true>>();
    assert<
        Equals<
            Awaited<ReturnType<typeof loggedIn.getAccessToken>>,
            { isUserLoggedIn: true; accessToken: string }
        >
    >();

    // @ts-expect-error auto-login cannot start an anonymous mock session
    OidcWithAutoLogin.provideMock({ isUserInitiallyLoggedIn: false });
    // @ts-expect-error user mocks must match the application model
    Oidc.provideMock({ user_mock: { displayName: 123 } });
    // @ts-expect-error autoLogin is a builder option, not runtime configuration
    Oidc.provide({ issuerUri: "", clientId: "", autoLogin: true });
    // @ts-expect-error Angular no longer accepts decodedIdTokenSchema
    Oidc.provide({ issuerUri: "", clientId: "", decodedIdTokenSchema: { parse: () => ({}) } });
    // @ts-expect-error withUser can only be called once
    base.withUser({ createUser });
    // @ts-expect-error non-blocking rendering can only be selected once
    base.withNonBlockingRendering().withNonBlockingRendering();
    // @ts-expect-error withAutoLogin can only be called once
    base.withAutoLogin().withAutoLogin();
}

// @ts-expect-error mock values must not widen the inferred User type
oidcSpa.withUser({ createUser, user_mock: { displayName: 123 } });
