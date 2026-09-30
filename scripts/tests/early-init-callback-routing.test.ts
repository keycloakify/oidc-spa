import { strict as assert } from "node:assert";
import { test } from "node:test";
import { runEarlyInitCallbackScenario } from "./early-init-callback-fixture";

test("early init accepts the callback URL issued by createOidc when its BASE_URL differs", async () => {
    const result = await runEarlyInitCallbackScenario({
        actualPath: "/app/",
        oidcCallbackUrl: "https://example.test/app/",
        BASE_URL: "/"
    });

    assert.equal(result.shouldLoadApp, true);
    assert.deepEqual(result.navigation, ["/app/after-login"]);
});
