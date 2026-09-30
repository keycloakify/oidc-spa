import { strict as assert } from "node:assert";
import { test } from "node:test";
import { runEarlyInitCallbackScenario } from "./early-init-callback-fixture";

test("early init ignores a callback response at a different path", async () => {
    const result = await runEarlyInitCallbackScenario({
        actualPath: "/account/",
        oidcCallbackUrl: "https://example.test/app/",
        BASE_URL: "/",
        queryBeforeResponse: "lang=de&"
    });

    assert.equal(result.shouldLoadApp, true);
    assert.deepEqual(result.navigation, ["/account/?lang=de"]);
});
