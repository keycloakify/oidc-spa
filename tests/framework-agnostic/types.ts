import {
    oidcSpa,
    type Oidc,
    type OidcSpaUtils,
    type CreateClientUser,
    type RuntimeConfigs
} from "../../src/framework-agnostic";
import { assert, type Equals } from "../../src/tools/tsafe/assert";

type User = { displayName: string };

// Never invoked: exercise the public builder, inference and overloads as a consumer.
export async function checkTypes() {
    // @ts-expect-error a user factory is required first
    oidcSpa.withRuntimeConfigs({ mode: "mock" });
    // @ts-expect-error utilities require a user factory and runtime configs
    oidcSpa.createUtils();

    const createUser: CreateClientUser<User> = async ({ isMock, idTokenClaims, user_current }) => {
        assert<Equals<typeof isMock, boolean>>;
        assert<Equals<typeof user_current, User | undefined>>;
        return { displayName: String(idTokenClaims.name) };
    };
    const builder = oidcSpa.withUser(createUser);
    // @ts-expect-error utilities require runtime configs
    builder.createUtils();
    // @ts-expect-error withUser is only available once
    builder.withUser(createUser);

    const utils = builder.withRuntimeConfigs({ mode: "mock" }).createUtils();
    assert<Equals<typeof utils, OidcSpaUtils<User>>>;
    assert<Equals<keyof typeof utils, "getOidc">>;

    const oidc = await utils.getOidc();
    assert<Equals<typeof oidc, Oidc<User>>>;
    const loggedIn = await utils.getOidc({ assert: "user logged in" });
    assert<Equals<typeof loggedIn, Oidc.LoggedIn<User>>>;
    assert<Equals<Awaited<ReturnType<typeof loggedIn.getUser>>, User>>;
    const loggedOut = await utils.getOidc({ assert: "user not logged in" });
    assert<Equals<typeof loggedOut, Oidc.NotLoggedIn>>;

    const inferred = oidcSpa
        .withUser(async () => ({ displayName: "Alice" }))
        .withRuntimeConfigs(async (): Promise<RuntimeConfigs> => ({ mode: "mock" }))
        .createUtils();
    assert<Equals<typeof inferred, typeof utils>>;

    const real = builder
        .withRuntimeConfigs(() => ({ mode: "real", issuerUri: "https://auth.test", clientId: "app" }))
        .createUtils();
    assert<Equals<typeof real, typeof utils>>;
}
