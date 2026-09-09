import { test } from "node:test";
import assert from "node:assert/strict";
import { createGetUser } from "../../src/core/createGetUser";
import { createEvt } from "../../src/tools/Evt";

async function setup(user: unknown, user_next: unknown) {
    const evtTokensChange = createEvt<void>();
    let callCount = 0;
    const { getUser } = createGetUser<unknown>({
        issuerUri: "https://issuer.test",
        clientId: "test",
        validRedirectUri: "https://app.test",
        oidcMetadata: {},
        evtTokensChange,
        getCurrentTokens: () =>
            ({
                accessToken: "opaque-token",
                decodedIdToken: { sub: "alice" }
            } as ReturnType<Parameters<typeof createGetUser>[0]["getCurrentTokens"]>),
        createUser: () => (++callCount === 1 ? user : user_next),
        renewTokens: async () => {
            evtTokensChange.post();
        }
    });
    const initial = await getUser();
    const changes: Array<{ user: unknown; user_previous: unknown }> = [];
    initial.subscribeToUserChange(change => changes.push(change));
    return { getUser, initial, changes };
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
        const { getUser, initial, changes } = await setup(current, next);
        const refreshed = await initial.refreshUser();
        const expected = unchanged ? current : next;
        assert.strictEqual(refreshed, expected);
        assert.strictEqual((await getUser()).user, expected);
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
        const { getUser, initial, changes } = await setup(user_current, user_next);
        assert.strictEqual(await initial.refreshUser(), user_next);
        assert.strictEqual((await getUser()).user, user_next);
        assert.equal(changes.length, 1);
        assert.strictEqual(changes[0].user, user_next);
        assert.strictEqual(changes[0].user_previous, user_current);
    });
}
