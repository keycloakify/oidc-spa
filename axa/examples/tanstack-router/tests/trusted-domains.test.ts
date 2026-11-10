import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";

test("worker allowlist matches the realm and API without matching lookalikes", async () => {
    const source = await readFile(new URL("../public/OidcTrustedDomains.js", import.meta.url), "utf8");
    const { default: config } = runInNewContext(`${source}\ntrustedDomains`, {
        self: { location: { origin: "http://axa.localhost:3002" } }
    });
    const matches = (rules: RegExp[], url: string) => rules.some(rule => rule.test(url));
    assert.ok(
        matches(
            config.oidcDomains,
            "https://phasetwo.oidc-spa.dev/realms/demo-realm/protocol/openid-connect/token"
        )
    );
    assert.ok(
        !matches(
            config.oidcDomains,
            "https://phasetwoXoidc-spa.dev/realms/demo-realm/protocol/openid-connect/token"
        )
    );
    assert.ok(
        !matches(
            config.oidcDomains,
            "https://phasetwo.oidc-spa.dev/realms/demo-realm-evil/protocol/openid-connect/token"
        )
    );
    assert.ok(matches(config.accessTokenDomains, "http://axa.localhost:3002/api/todos"));
    assert.ok(
        matches(config.accessTokenDomains, "http://axa.localhost:3002/api/trpc/todos.list?batch=1")
    );
    for (const url of [
        "http://axa.localhost:3002/api-evil",
        "http://axaXlocalhost:3002/api/todos",
        "http://axa.localhost:3002.evil.example/api/todos",
        "http://app.localhost:3000/api/todos",
        "https://another.example/api/todos"
    ])
        assert.ok(!matches(config.accessTokenDomains, url), url);
});
