import { strict as assert } from "node:assert";
import { test } from "node:test";
import { runEarlyInitCallbackScenario } from "./early-init-callback-fixture";

test("early init accepts an in-flight redirect stored before callback URLs were recorded", async () => {
    const result = await runEarlyInitCallbackScenario({
        actualPath: "/app/",
        BASE_URL: "/"
    });

    assert.equal(result.shouldLoadApp, true);
    assert.deepEqual(result.navigation, ["/app/after-login"]);
});
