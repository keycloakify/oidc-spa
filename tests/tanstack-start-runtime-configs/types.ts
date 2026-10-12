import type { RuntimeConfigs } from "../../src/tanstack-start/react/types";
import type { OidcSpa } from "../../src/tanstack-start/react/oidcSpa";
import { tanstackStartRuntimeConfigsEnvPolicy } from "../../src/vite-plugin/handleTanstackStartRuntimeConfigs";
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

declare const builder: OidcSpa<unknown, unknown, false>;
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
