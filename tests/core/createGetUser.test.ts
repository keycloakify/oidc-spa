import { test } from "node:test";
import assert from "node:assert/strict";
import { createGetUser } from "../../src/core/createGetUser";
import { createEvt } from "../../src/tools/Evt";
import { Deferred } from "../../src/tools/Deferred";
import { AssertionError } from "../../src/tools/tsafe/assert";
import { OidcInitializationError } from "../../src/core/OidcInitializationError";
import type { CreateUser, IdTokenClaims, OidcTokens } from "../../src/core/types";

function makeTokens(claims: Partial<IdTokenClaims> = {}, accessToken = "opaque-token"): OidcTokens {
    return {
        hasRefreshToken: false,
        accessToken,
        accessTokenExpirationTime: 2_000_000,
        idToken: "id-token",
        idTokenClaims: {
            iss: "https://issuer.test",
            sub: "alice",
            aud: "test",
            exp: 2_000,
            iat: 1_000,
            ...claims
        },
        issuedAtTime: 1_000_000,
        getServerDateNow: () => 1_000_000
    };
}

function jwt(claims: unknown): string {
    return `header.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.signature`;
}

function fixture<User>(
    createUser: CreateUser<User> | undefined,
    options: {
        tokens?: OidcTokens;
        renewTokens?: () => Promise<void>;
        getTokens?: () => Promise<OidcTokens>;
    } = {}
) {
    let tokens = options.tokens ?? makeTokens();
    let renewCount = 0;
    let readCount = 0;
    const evtTokensChange = createEvt<void>();
    const getTokens = async () => {
        readCount++;
        return options.getTokens === undefined ? tokens : options.getTokens();
    };
    const methods = createGetUser<User>({
        issuerUri: "https://issuer.test",
        clientId: "test",
        validRedirectUri: "https://app.test",
        oidcProviderMetadata: {},
        evtTokensChange,
        getTokens,
        createUser,
        renewTokens: async () => {
            renewCount++;
            if (options.renewTokens !== undefined) {
                await options.renewTokens();
                return;
            }
            evtTokensChange.post();
        }
    });

    return {
        ...methods,
        getAccessToken: async () => (await getTokens()).accessToken,
        rotate(next: OidcTokens) {
            tokens = next;
            evtTokensChange.post();
        },
        get renewCount() {
            return renewCount;
        },
        get readCount() {
            return readCount;
        }
    };
}

async function setup(user: unknown, user_next: unknown) {
    let callCount = 0;
    const methods = fixture<unknown>(() => (++callCount === 1 ? user : user_next));
    const initial = await methods.getUser();
    const changes: Array<{ user: unknown; user_previous: unknown }> = [];
    methods.subscribeToUserChange(change => changes.push(change));
    return { ...methods, initial, changes };
}

const shared = { role: "admin" };
const symbol = Symbol("role");
const circularA: Record<string, unknown> = { name: "Alice" };
circularA.self = circularA;
const circularB: Record<string, unknown> = { name: "Alice" };
circularB.self = circularB;

for (const [name, current, next, unchanged] of [
    [
        "nested objects and arrays",
        { roles: ["admin", { id: 1 }] },
        { roles: ["admin", { id: 1 }] },
        true
    ],
    ["property order", { name: "Alice", id: 1 }, { id: 1, name: "Alice" }, true],
    [
        "shared acyclic children",
        { a: shared, b: shared },
        { a: { role: "admin" }, b: { role: "admin" } },
        true
    ],
    ["NaN", { value: NaN }, { value: NaN }, true],
    ["changed nested role", { roles: ["admin"] }, { roles: ["user"] }, false],
    ["array order", ["admin", "user"], ["user", "admin"], false],
    ["missing own property", { a: undefined }, { b: undefined }, false],
    ["array versus object", [], {}, false],
    ["sparse array length", new Array(1), new Array(2), false],
    ["array hole versus undefined", new Array(1), [undefined], false],
    ["date values", { date: new Date(0) }, { date: new Date(1) }, false],
    ["set contents", { roles: new Set(["admin"]) }, { roles: new Set(["user"]) }, false],
    ["map contents", new Map([["role", "admin"]]), new Map([["role", "user"]]), false],
    ["functions", { canEdit: () => true }, { canEdit: () => false }, false],
    ["symbol keys", { [symbol]: "admin" }, { [symbol]: "user" }, false],
    ["distinct circular objects", circularA, circularB, false],
    ["same circular object", circularA, circularA, true]
] as const) {
    test(`user refresh: ${name}`, async () => {
        const { getUser, refreshUser, changes } = await setup(current, next);
        assert.equal(await refreshUser(), undefined);
        const expected = unchanged ? current : next;
        assert.strictEqual(await getUser(), expected);
        assert.equal(changes.length, unchanged ? 0 : 1);
        if (!unchanged) {
            assert.strictEqual(changes[0].user, next);
            assert.strictEqual(changes[0].user_previous, current);
        }
    });
}

for (const [name, user_next] of [
    [
        "throwing getter",
        {
            get name() {
                throw new Error("broken getter");
            }
        }
    ],
    [
        "throwing prototype trap",
        new Proxy(
            {},
            {
                getPrototypeOf() {
                    throw new Error("opaque prototype");
                }
            }
        )
    ],
    [
        "throwing ownKeys trap",
        new Proxy(
            {},
            {
                ownKeys() {
                    throw new Error("opaque properties");
                }
            }
        )
    ]
] as const) {
    test(`failed comparison still updates the user: ${name}`, async () => {
        const user_current = { name: "Alice" };
        const { getUser, refreshUser, changes } = await setup(user_current, user_next);
        await refreshUser();
        assert.strictEqual(await getUser(), user_next);
        assert.equal(changes.length, 1);
        assert.strictEqual(changes[0].user, user_next);
        assert.strictEqual(changes[0].user_previous, user_current);
    });
}

test("creation and subscriptions are lazy; the first reader uses the latest tokens", async () => {
    const calls: Array<Parameters<CreateUser<string>>[0]> = [];
    const f = fixture<string>(params => {
        calls.push(params);
        return String(params.idTokenClaims.name);
    });
    const changes: unknown[] = [];
    const { unsubscribeFromUserChange } = f.subscribeToUserChange(change => changes.push(change));
    f.rotate(makeTokens({ name: "Updated" }));
    await Promise.resolve();
    assert.equal(calls.length, 0);
    assert.equal(f.readCount, 0);
    assert.equal(await f.getUser(), "Updated");
    assert.equal(calls.length, 1);
    assert.equal(calls[0].user_current, undefined);
    assert.equal(calls[0].issuerUri, "https://issuer.test");
    assert.equal(calls[0].clientId, "test");
    assert.equal(calls[0].validRedirectUri, "https://app.test");
    assert.deepEqual(changes, [{ user: "Updated", user_previous: undefined }]);

    const reads = f.readCount;
    assert.equal(await f.getUser(), "Updated");
    assert.equal(f.readCount, reads);
    const lateChanges: unknown[] = [];
    f.subscribeToUserChange(change => lateChanges.push(change));
    assert.equal(lateChanges.length, 0);
    unsubscribeFromUserChange();
    unsubscribeFromUserChange();
    f.rotate(makeTokens({ name: "Later" }));
    assert.equal(await f.getUser(), "Later");
    assert.equal(changes.length, 1);
    assert.deepEqual(lateChanges, [{ user: "Later", user_previous: "Updated" }]);
});

test("concurrent readers share one computation, including undefined users", async () => {
    let calls = 0;
    const result = new Deferred<undefined>();
    const f = fixture(() => {
        calls++;
        return result.pr;
    });
    const readers = [f.getUser(), f.getUser(), f.getUser()];
    result.resolve(undefined);
    assert.deepEqual(await Promise.all(readers), [undefined, undefined, undefined]);
    assert.equal(await f.getUser(), undefined);
    assert.equal(calls, 1);
});

test("refreshUser activates creation, renews first, and coalesces concurrent refreshes", async () => {
    const renewalStarted = new Deferred<void>();
    const renewal = new Deferred<void>();
    const calls: string[] = [];
    const f = fixture(
        ({ idTokenClaims }) => {
            calls.push(String(idTokenClaims.name));
            return String(idTokenClaims.name);
        },
        {
            renewTokens: async () => {
                renewalStarted.resolve();
                await renewal.pr;
                f.rotate(makeTokens({ name: "Fresh" }));
            }
        }
    );
    const refreshes = [f.refreshUser(), f.refreshUser()];
    const read = f.getUser();
    await renewalStarted.pr;
    assert.equal(calls.length, 0);
    renewal.resolve();
    await Promise.all(refreshes);
    assert.equal(await read, "Fresh");
    assert.deepEqual(calls, ["Fresh"]);
    assert.equal(f.renewCount, 1);
});

test("getUser waits from the start of refreshUser through the new computation", async () => {
    let calls = 0;
    const renewal = new Deferred<void>();
    const computationStarted = new Deferred<void>();
    const result = new Deferred<string>();
    const f = fixture(
        () => {
            if (++calls === 1) {
                return "Cached";
            }
            computationStarted.resolve();
            return result.pr;
        },
        { renewTokens: () => renewal.pr }
    );
    assert.equal(await f.getUser(), "Cached");
    const refresh = f.refreshUser();
    let hasReturned = false;
    const read = f.getUser().then(user => {
        hasReturned = true;
        return user;
    });
    await Promise.resolve();
    assert.equal(hasReturned, false);
    renewal.resolve();
    await computationStarted.pr;
    assert.equal(hasReturned, false);
    result.resolve("Fresh");
    await refresh;
    assert.equal(await read, "Fresh");
    assert.equal(calls, 2);
});

test("initial failures are shared OidcInitializationErrors and a later read retries", async () => {
    let calls = 0;
    const failure = new Error("API unavailable");
    const f = fixture(() => {
        if (++calls < 3) {
            throw failure;
        }
        return "Recovered";
    });
    const results = await Promise.allSettled([f.getUser(), f.getUser()]);
    const errors = results.map(result => {
        assert.equal(result.status, "rejected");
        assert(result.reason instanceof OidcInitializationError);
        assert.equal(Reflect.get(result.reason, "cause"), failure);
        assert.equal(result.reason.isAuthServerLikelyDown, false);
        return result.reason;
    });
    assert.equal(errors[0], errors[1]);
    assert.equal(calls, 1);
    await assert.rejects(f.getUser(), OidcInitializationError);
    assert.equal(await f.getUser(), "Recovered");
    assert.equal(calls, 3);
});

test("refreshUser reports an initial creation failure and can retry", async t => {
    t.mock.method(console, "error", () => {});
    let fails = true;
    const f = fixture(() => {
        if (fails) {
            throw "API unavailable";
        }
        return "Recovered";
    });
    await assert.rejects(f.refreshUser(), error => {
        assert(error instanceof OidcInitializationError);
        assert.match(error.message, /API unavailable/);
        return true;
    });
    fails = false;
    await f.refreshUser();
    assert.equal(await f.getUser(), "Recovered");
    assert.equal(f.renewCount, 2);
});

test("failed automatic and explicit recomputations retain the cache and do not notify", async t => {
    const log = t.mock.method(console, "error", () => {});
    const failure = new Error("API unavailable");
    let fails = false;
    const previousUsers: Array<string | undefined> = [];
    const f = fixture<string>(
        ({ idTokenClaims, user_current }) => {
            previousUsers.push(user_current);
            if (fails) {
                throw failure;
            }
            return String(idTokenClaims.name);
        },
        { tokens: makeTokens({ name: "Cached" }) }
    );
    await f.getUser();
    const changes: unknown[] = [];
    f.subscribeToUserChange(change => changes.push(change));
    fails = true;
    f.rotate(makeTokens({ name: "Fresh" }));
    assert.equal(await f.getUser(), "Cached");
    assert.equal(log.mock.callCount(), 1);
    assert.equal(changes.length, 0);
    const refresh = assert.rejects(f.refreshUser(), error => error === failure);
    assert.equal(await f.getUser(), "Cached");
    await refresh;
    assert.equal(log.mock.callCount(), 2);

    fails = false;
    // Retry even though these claims match the previous failed attempt.
    f.rotate(makeTokens({ name: "Fresh", exp: 3_000 }));
    assert.equal(await f.getUser(), "Fresh");
    assert.deepEqual(previousUsers, [undefined, "Cached", "Cached", "Cached"]);
    assert.deepEqual(changes, [{ user: "Fresh", user_previous: "Cached" }]);
});

test("failed token renewal rejects refreshUser but cached readers still succeed", async t => {
    const log = t.mock.method(console, "error", () => {});
    const failure = new Error("renewal failed");
    let calls = 0;
    const f = fixture(() => ++calls, {
        renewTokens: async () => {
            throw failure;
        }
    });
    assert.equal(await f.getUser(), 1);
    const refresh = assert.rejects(f.refreshUser(), error => error === failure);
    assert.equal(await f.getUser(), 1);
    await refresh;
    assert.equal(calls, 1);
    assert.equal(log.mock.callCount(), 1);
});

test("token rotations during creation discard stale results and serialize computations", async () => {
    const started = new Deferred<void>();
    const finishFirst = new Deferred<void>();
    const calls: string[] = [];
    let active = 0;
    const f = fixture(
        async ({ idTokenClaims }) => {
            assert.equal(active++, 0);
            const name = String(idTokenClaims.name);
            calls.push(name);
            if (calls.length === 1) {
                started.resolve();
                await finishFirst.pr;
            }
            active--;
            return name;
        },
        { tokens: makeTokens({ name: "Old" }) }
    );
    const changes: unknown[] = [];
    f.subscribeToUserChange(change => changes.push(change));
    const read = f.getUser();
    await started.pr;
    f.rotate(makeTokens({ name: "Intermediate" }));
    f.rotate(makeTokens({ name: "Newest" }));
    const otherRead = f.getUser();
    finishFirst.resolve();
    assert.deepEqual(await Promise.all([read, otherRead]), ["Newest", "Newest"]);
    assert.deepEqual(calls, ["Old", "Newest"]);
    assert.deepEqual(changes, [{ user: "Newest", user_previous: undefined }]);
});

test("lifecycle-only rotations during creation do not trigger another computation", async () => {
    let calls = 0;
    const started = new Deferred<void>();
    const result = new Deferred<string>();
    const f = fixture(() => {
        calls++;
        started.resolve();
        return result.pr;
    });
    const read = f.getUser();
    await started.pr;
    f.rotate(makeTokens({ exp: 3_000, iat: 2_000, nonce: "new" }));
    result.resolve("User");
    assert.equal(await read, "User");
    assert.equal(calls, 1);
});

test("refresh during creation renews and forces a second serialized computation", async () => {
    let calls = 0;
    const started = new Deferred<void>();
    const finishFirst = new Deferred<string>();
    const f = fixture(() => {
        if (++calls === 1) {
            started.resolve();
            return finishFirst.pr;
        }
        assert.equal(f.renewCount, 1);
        return "Fresh";
    });
    const changes: unknown[] = [];
    f.subscribeToUserChange(change => changes.push(change));
    const read = f.getUser();
    await started.pr;
    const refresh = f.refreshUser();
    finishFirst.resolve("Old");
    await refresh;
    assert.equal(await read, "Fresh");
    assert.equal(calls, 2);
    assert.deepEqual(changes, [{ user: "Fresh", user_previous: undefined }]);
});

test("a token rotation racing with getTokens uses the newer snapshot", async () => {
    const started = new Deferred<void>();
    const firstRead = new Deferred<OidcTokens>();
    let reads = 0;
    const names: string[] = [];
    const f = fixture(
        ({ idTokenClaims }) => {
            names.push(String(idTokenClaims.name));
            return String(idTokenClaims.name);
        },
        {
            getTokens: async () => {
                if (++reads === 1) {
                    started.resolve();
                    return firstRead.pr;
                }
                return makeTokens({ name: "Newest" });
            }
        }
    );
    const read = f.getUser();
    await started.pr;
    f.rotate(makeTokens({ name: "Newest" }));
    firstRead.resolve(makeTokens({ name: "Old" }));
    assert.equal(await read, "Newest");
    assert.deepEqual(names, ["Newest"]);
});

test("a queued explicit refresh can recover from an already-running failed computation", async t => {
    t.mock.method(console, "error", () => {});
    let calls = 0;
    const started = new Deferred<void>();
    const failing = new Deferred<string>();
    const f = fixture(() => {
        switch (++calls) {
            case 1:
                return "Cached";
            case 2:
                started.resolve();
                return failing.pr;
            default:
                return "Recovered";
        }
    });
    await f.getUser();
    f.rotate(makeTokens({ name: "Updated" }));
    await started.pr;
    const refresh = f.refreshUser();
    const read = f.getUser();
    failing.reject(new Error("previous computation failed"));
    await refresh;
    assert.equal(await read, "Recovered");
    assert.equal(f.renewCount, 1);
});

test("forced refresh survives a token change back to the cached claims", async () => {
    let calls = 0;
    const started = new Deferred<void>();
    const finishStale = new Deferred<string>();
    const f = fixture(
        () => {
            if (++calls === 1) {
                return "Cached";
            }
            if (calls === 2) {
                started.resolve();
                return finishStale.pr;
            }
            return "Fresh API data";
        },
        {
            renewTokens: async () => {
                f.rotate(makeTokens({ name: "Intermediate" }));
            }
        }
    );
    await f.getUser();
    const refresh = f.refreshUser();
    await started.pr;
    f.rotate(makeTokens());
    finishStale.resolve("Discarded");
    await refresh;
    assert.equal(await f.getUser(), "Fresh API data");
    assert.equal(calls, 3);
});

test("subscriber-triggered refreshes are included before readers return", async () => {
    let calls = 0;
    const f = fixture(() => ++calls);
    let refresh: Promise<void> | undefined;
    f.subscribeToUserChange(({ user }) => {
        if (user === 1) {
            refresh = f.refreshUser();
        }
    });
    assert.equal(await f.getUser(), 2);
    await refresh;
    assert.equal(f.renewCount, 1);
});

test("equal users update the comparison hash without replacing the cached object", async () => {
    let calls = 0;
    const f = fixture(() => {
        calls++;
        return { name: "Alice" };
    });
    const initial = await f.getUser();
    f.rotate(makeTokens({ name: "Alice" }));
    assert.equal(await f.getUser(), initial);
    assert.equal(calls, 2);
    f.rotate(makeTokens({ name: "Alice", exp: 3_000 }));
    assert.equal(await f.getUser(), initial);
    assert.equal(calls, 2);
});

test("createUser can call an API that awaits getAccessToken, including token renewal", async t => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const warnings = t.mock.method(console, "warn", () => {});
    let tokenReads = 0;
    let userCalls = 0;
    const oldTokens = makeTokens({ name: "Old" }, "old-access-token");
    const newTokens = makeTokens({ name: "New" }, "new-access-token");
    async function myApiGetUser(): Promise<{ accessToken: string }> {
        const accessToken = await f.getAccessToken();
        t.mock.timers.tick(5_000);
        return { accessToken };
    }
    const f = fixture(
        async () => {
            userCalls++;
            return myApiGetUser();
        },
        {
            getTokens: async () => {
                tokenReads++;
                if (tokenReads === 1) {
                    return oldTokens;
                }
                if (tokenReads === 2) {
                    f.rotate(newTokens);
                }
                return newTokens;
            }
        }
    );
    assert.deepEqual(await f.getUser(), { accessToken: "new-access-token" });
    assert.equal(userCalls, 2);
    assert.equal(warnings.mock.callCount(), 0);
});

test("listener failures do not invalidate a successful creation or skip other listeners", async t => {
    const logs = t.mock.method(console, "error", () => {});
    const f = fixture(() => "User");
    f.subscribeToUserChange(() => {
        throw new Error("listener failed");
    });
    const changes: unknown[] = [];
    f.subscribeToUserChange(change => changes.push(change));
    assert.equal(await f.getUser(), "User");
    assert.equal(await f.getUser(), "User");
    assert.deepEqual(changes, [{ user: "User", user_previous: undefined }]);
    assert.equal(logs.mock.callCount(), 1);
});

test("missing createUser consistently produces assertion errors without reading tokens", async () => {
    const f = fixture(undefined);
    await assert.rejects(f.getUser(), AssertionError);
    await assert.rejects(f.refreshUser(), AssertionError);
    assert.throws(() => f.subscribeToUserChange(() => {}), AssertionError);
    assert.equal(f.readCount, 0);
    assert.equal(f.renewCount, 0);
});

for (const method of ["getUser", "refreshUser"] as const) {
    test(`synchronous ${method} cycles fail immediately with a meaningful error`, async () => {
        const f = fixture<string>(async () => {
            await f[method]();
            return "unreachable";
        });
        await assert.rejects(f.getUser(), error => {
            assert(error instanceof OidcInitializationError);
            assert.match(error.message, /cycle detected/);
            assert.match(error.message, new RegExp(method));
            assert.match(error.message, /getAccessToken/);
            return true;
        });
    });

    test(`indirect asynchronous ${method} cycles emit a diagnostic after three seconds`, async t => {
        t.mock.timers.enable({ apis: ["setTimeout"] });
        const warnings = t.mock.method(console, "warn", () => {});
        const entered = new Deferred<void>();
        const release = new Deferred<string>();
        const f = fixture<string>(async (): Promise<string> => {
            await Promise.resolve();
            const nested = f[method]().then(() => "Nested");
            entered.resolve();
            // The release lets this test cleanly settle the otherwise cyclic computation.
            return Promise.race([nested, release.pr]);
        });
        const read = f.getUser();
        await entered.pr;
        t.mock.timers.tick(2_999);
        assert.equal(warnings.mock.callCount(), 0);
        t.mock.timers.tick(1);
        assert.equal(warnings.mock.callCount(), 1);
        assert.match(String(warnings.mock.calls[0].arguments[0]), /Potential user creation deadlock/);
        t.mock.timers.tick(10_000);
        assert.equal(warnings.mock.callCount(), 1);
        release.resolve("User");
        assert.equal(await read, "User");
    });
}

test("slow independent readers are warned but still receive the eventual user", async t => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const warnings = t.mock.method(console, "warn", () => {});
    const started = new Deferred<void>();
    const result = new Deferred<string>();
    const f = fixture(() => {
        started.resolve();
        return result.pr;
    });
    const first = f.getUser();
    await started.pr;
    const second = f.getUser();
    t.mock.timers.tick(3_000);
    assert.equal(warnings.mock.callCount(), 1);
    result.resolve("User");
    assert.deepEqual(await Promise.all([first, second]), ["User", "User"]);
});

test("cycle diagnostics are cleared when creation settles, including failures", async t => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const warnings = t.mock.method(console, "warn", () => {});
    for (const fails of [false, true]) {
        const started = new Deferred<void>();
        const result = new Deferred<string>();
        const f = fixture(() => {
            started.resolve();
            return result.pr;
        });
        const first = f.getUser();
        await started.pr;
        const second = f.getUser();
        const settled = Promise.allSettled([first, second]);
        if (fails) {
            result.reject(new Error("failed"));
        } else {
            result.resolve("User");
        }
        await settled;
        t.mock.timers.tick(3_000);
        assert.equal(warnings.mock.callCount(), 0);
    }
});

test("nested claim key order is ignored, including objects inside arrays", async () => {
    let calls = 0;
    const f = fixture(() => ++calls, {
        tokens: makeTokens(
            { address: { first: "A", second: "B" }, custom: [{ a: 1, b: 2 }] },
            jwt({ resource_access: { api: { roles: ["admin"], nested: { a: 1, b: 2 } } } })
        )
    });
    assert.equal(await f.getUser(), 1);
    f.rotate(
        makeTokens(
            { custom: [{ b: 2, a: 1 }], address: { second: "B", first: "A" } },
            jwt({ resource_access: { api: { nested: { b: 2, a: 1 }, roles: ["admin"] } } })
        )
    );
    assert.equal(await f.getUser(), 1);
    assert.equal(calls, 1);
});

test("ignored lifecycle claims and JWT signatures do not recompute users", async () => {
    let calls = 0;
    const f = fixture(() => ++calls, { tokens: makeTokens({}, jwt({ role: "admin" })) });
    await f.getUser();
    f.rotate(
        makeTokens(
            { exp: 3_000, iat: 2_000, nonce: "new" },
            jwt({
                role: "admin",
                exp: 3_000,
                iat: 2_000,
                jti: "new",
                nbf: 1_999,
                cnf: { jkt: "key" }
            }).replace(".signature", ".another-signature")
        )
    );
    assert.equal(await f.getUser(), 1);
    assert.equal(calls, 1);
});

for (const [claim, value] of [
    ["acr", "mfa"],
    ["amr", ["pwd", "otp"]],
    ["auth_time", 1_500]
] as const) {
    test(`changed ${claim} triggers automatic recomputation`, async () => {
        let calls = 0;
        const f = fixture(() => ++calls);
        await f.getUser();
        f.rotate(makeTokens({ [claim]: value }));
        assert.equal(await f.getUser(), 2);
    });
}

test("changed access-token roles and array order trigger recomputation", async () => {
    let calls = 0;
    const f = fixture(() => ++calls, { tokens: makeTokens({}, jwt({ roles: ["a", "b"] })) });
    await f.getUser();
    f.rotate(makeTokens({}, jwt({ roles: ["b", "a"] })));
    assert.equal(await f.getUser(), 2);
    f.rotate(makeTokens({}, jwt({ roles: ["c"] })));
    assert.equal(await f.getUser(), 3);
});

test("opaque or non-object access-token payloads do not fail user creation", async () => {
    let calls = 0;
    const f = fixture(() => ++calls);
    await f.getUser();
    for (const token of ["new-opaque-token", jwt(null), jwt("opaque"), jwt([])]) {
        f.rotate(makeTokens({}, token));
        assert.equal(await f.getUser(), 1);
    }
    await f.refreshUser();
    assert.equal(await f.getUser(), 2);
});
