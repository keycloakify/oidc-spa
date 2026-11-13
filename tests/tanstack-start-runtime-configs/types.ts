import type {
    RuntimeConfigs,
    Oidc,
    Oidc_react,
    Oidc_server,
    OidcFnMiddleware,
    OidcRequestMiddleware
} from "../../src/tanstack-start/react/types";
import { oidcSpa } from "../../src/tanstack-start/react/oidcSpa";
import type { OidcSpa } from "../../src/tanstack-start/react/oidcSpa";
import { tanstackStartRuntimeConfigsEnvPolicy } from "../../src/vite-plugin/tanstack-start/handleTanstackStartRuntimeConfigs";
import { assert, type Equals } from "../../src/tools/tsafe/assert";

type KeysOfUnion<T> = T extends T ? keyof T : never;

type Real = RuntimeConfigs.Real<true>;
type Mock = RuntimeConfigs.Mock<true>;

assert<Equals<keyof typeof tanstackStartRuntimeConfigsEnvPolicy.real, keyof Real>>;
assert<Equals<keyof typeof tanstackStartRuntimeConfigsEnvPolicy.mock, keyof Mock>>;
assert<
    Equals<keyof typeof tanstackStartRuntimeConfigsEnvPolicy.real.server, KeysOfUnion<Real["server"]>>
>;
assert<Equals<keyof typeof tanstackStartRuntimeConfigsEnvPolicy.real.client, keyof Real["client"]>>;
assert<
    Equals<
        keyof typeof tanstackStartRuntimeConfigsEnvPolicy.mock.server,
        keyof NonNullable<Mock["server"]>
    >
>;
assert<
    Equals<
        keyof typeof tanstackStartRuntimeConfigsEnvPolicy.mock.client,
        keyof NonNullable<Mock["client"]>
    >
>;
assert<Equals<typeof tanstackStartRuntimeConfigsEnvPolicy.real.server.clientSecret, "redact">>;

// Client-only configurations use the same client policy and omit server configs.
assert<Equals<keyof RuntimeConfigs.Real<false>, Exclude<keyof Real, "server">>>;
assert<Equals<keyof RuntimeConfigs.Mock<false>, Exclude<keyof Mock, "server">>>;

declare const builder: OidcSpa<unknown, unknown>;
const configured = builder
    .withClientUser(({ idTokenClaims }) => idTokenClaims.sub)
    .withServerUser(({ accessTokenClaims }) => accessTokenClaims.sub)
    .withRuntimeConfigs(async ({ process }) => ({
        mode: "real",
        issuerUri: process.env.ISSUER,
        client: {
            clientId: process.env.CLIENT,
            authorizationParams: { audience: process.env.AUTHORIZATION_AUDIENCE },
            tokenParams: { resource: process.env.TOKEN_RESOURCE },
            autoLogout_returnToUrl: process.env.LOGOUT_RETURN_TO
        },
        server: {
            accessTokenValidationMethod: "introspection endpoint",
            clientId: process.env.SERVER_CLIENT,
            clientSecret: process.env.SERVER_SECRET
        }
    }));
configured.createUtils();

builder
    .withClientUser(() => ({}))
    .withServerUser(() => ({}))
    .withRuntimeConfigs({
        mode: "mock",
        client: { refreshToken_mock: "refresh", idToken_mock: "id" }
    })
    .createUtils();

// Never invoked: verify the unified API and optional/required server authentication.
export async function checkAdapterTypes() {
    type ClientUser = { displayName: string };
    type ServerUser = { id: string };
    const base = oidcSpa
        .withClientUser<ClientUser>(() => ({ displayName: "Alice" }))
        .withServerUser<ServerUser>(() => ({ id: "user" }));
    const utils = base.withRuntimeConfigs({ mode: "mock" }).createUtils();
    const state = utils.useOidc();
    assert<Equals<typeof state, Oidc_react<ClientUser>>>;
    if (state.isOidcReady && state.isUserLoggedIn) {
        assert<Equals<typeof state.user, ClientUser>>;
    }
    const loggedIn = utils.useOidc({ assert: "user logged in" });
    assert<Equals<typeof loggedIn, Oidc_react.LoggedIn<ClientUser>>>;
    const loggedOut = utils.useOidc({ assert: "user not logged in" });
    assert<Equals<typeof loggedOut, Oidc_react.NotLoggedIn>>;
    const oidc = await utils.getOidc({ assert: "user logged in" });
    assert<Equals<typeof oidc, Oidc.LoggedIn<ClientUser>>>;
    await utils.enforceLogin({ cause: "enter", location: { href: "/private" } });

    const optionalFn = utils.oidcFnMiddleware();
    const requiredFn = utils.oidcFnMiddleware({
        require: "authed request",
        hasAuthorization: ({ user }) => {
            assert<Equals<typeof user, ServerUser>>;
            return true;
        }
    });
    assert<
        Equals<
            typeof optionalFn,
            OidcFnMiddleware.TanStackFnMiddleware<{ oidc: Oidc_server<ServerUser> }>
        >
    >;
    assert<
        Equals<
            typeof requiredFn,
            OidcFnMiddleware.TanStackFnMiddleware<{ oidc: Oidc_server.LoggedIn<ServerUser> }>
        >
    >;
    const optionalRequest = utils.oidcRequestMiddleware();
    const requiredRequest = utils.oidcRequestMiddleware({ require: "authed request" });
    assert<
        Equals<
            typeof optionalRequest,
            OidcRequestMiddleware.TanstackRequestMiddleware<{ oidc: Oidc_server<ServerUser> }>
        >
    >;
    assert<
        Equals<
            typeof requiredRequest,
            OidcRequestMiddleware.TanstackRequestMiddleware<{
                oidc: Oidc_server.LoggedIn<ServerUser>;
            }>
        >
    >;

    const clientOnly = oidcSpa
        .withClientUser<ClientUser>(() => ({ displayName: "Alice" }))
        .withRuntimeConfigs({ mode: "mock" })
        .createUtils();
    // @ts-expect-error client-only utilities do not expose server middleware
    clientOnly.oidcFnMiddleware;
    // @ts-expect-error client-only utilities do not expose server middleware
    clientOnly.oidcRequestMiddleware;
    // @ts-expect-error auto-login mode has been removed
    base.withAutoLogin();
    // @ts-expect-error the auto-login-only assertion has been removed
    utils.useOidc({ assert: "ready" });
}
