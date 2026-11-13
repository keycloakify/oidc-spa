import { strict as assert } from "node:assert";
import { createHash, randomUUID } from "node:crypto";
import { test } from "node:test";
import { calculateJwkThumbprint, exportJWK, generateKeyPair, SignJWT } from "jose";
import { extractRequestAuthContext, oidcSpa } from "../../src/server";

test("request authentication memoization preserves DPoP replay protection", async t => {
    const issuerUri = "https://idp.example";
    const accessToken = "opaque-access-token";
    const { publicKey, privateKey } = await generateKeyPair("ES256");
    const jwk = await exportJWK(publicKey);
    const jkt = await calculateJwkThumbprint(jwk);
    let introspectionCalls = 0;

    t.mock.method(globalThis, "fetch", async (input: string | URL | Request, init?: RequestInit) => {
        const url = String(input);
        if (url.endsWith("/.well-known/openid-configuration")) {
            return Response.json({ introspection_endpoint: `${issuerUri}/introspect` });
        }
        assert.equal(url, `${issuerUri}/introspect`);
        assert.equal(new URLSearchParams(String(init?.body)).get("token"), accessToken);
        introspectionCalls++;
        return Response.json({
            active: true,
            iss: issuerUri,
            sub: "alice",
            exp: Math.floor(Date.now() / 1000) + 300,
            cnf: { jkt }
        });
    });

    function validator(issuer = issuerUri) {
        const { bootstrapAuth, validateAndGetAccessTokenClaims } = oidcSpa.createUtils();
        bootstrapAuth({
            mode: "real",
            issuerUri: issuer,
            accessTokenValidation: {
                method: "introspection endpoint",
                clientId: "api",
                clientSecret: "test-secret"
            }
        });
        return validateAndGetAccessTokenClaims;
    }

    async function request() {
        const url = "https://api.example/todos";
        const proof = await new SignJWT({
            htm: "GET",
            htu: url,
            ath: createHash("sha256").update(accessToken).digest("base64url")
        })
            .setProtectedHeader({ alg: "ES256", typ: "dpop+jwt", jwk })
            .setIssuedAt()
            .setJti(randomUUID())
            .sign(privateKey);
        return new Request(url, {
            headers: { Authorization: `DPoP ${accessToken}`, DPoP: proof }
        });
    }

    function metadata(request: Request, trustProxy = true) {
        const context = extractRequestAuthContext({ request, trustProxy });
        assert(context?.isWellFormed);
        return context.accessTokenAndMetadata;
    }

    await t.test("concurrent and subsequent validations of one request share the result", async () => {
        const validate = validator();
        const req = await request();
        const before = introspectionCalls;
        const results = await Promise.all([validate(metadata(req)), validate(metadata(req))]);
        assert(results.every(result => result.isSuccess));
        assert.equal((await validate(metadata(req))).isSuccess, true);
        assert.equal(introspectionCalls - before, 1);
    });

    await t.test("another request carrying the same proof is rejected", async () => {
        const validate = validator();
        const req = await request();
        assert.equal((await validate(metadata(req))).isSuccess, true);
        const replay = await validate(metadata(new Request(req)));
        assert.equal(replay.isSuccess, false);
        assert.equal(replay.recommendedHttpErrorStatusCode, 401);
        assert.equal(replay.debugErrorMessage, "DPoP proof replayed");
    });

    await t.test("fresh proofs with the same access token remain valid", async () => {
        const validate = validator();
        const first = await request();
        const second = await request();
        assert.equal((await validate(metadata(first))).isSuccess, true);
        assert.equal((await validate(metadata(second))).isSuccess, true);
    });

    await t.test(
        "reconstructing metadata loses memoization and still rejects a used proof",
        async () => {
            const validate = validator();
            const params = metadata(await request());
            assert.equal((await validate(params)).isSuccess, true);
            const copied = await validate({ ...params });
            assert.equal(copied.isSuccess, false);
            assert.equal(copied.debugErrorMessage, "DPoP proof replayed");
        }
    );

    await t.test("validator instances do not reuse each other's decisions", async () => {
        const params = metadata(await request());
        assert.equal((await validator()(params)).isSuccess, true);
        const otherIssuer = await validator("https://another-idp.example")(params);
        assert.equal(otherIssuer.isSuccess, false);
        assert.match(otherIssuer.debugErrorMessage!, /issuerUri/);
    });

    await t.test("proxy policies preserve separate extraction identities and URLs", async () => {
        const req = new Request("http://internal.example/todos?filter=active", {
            headers: {
                Authorization: `DPoP ${accessToken}`,
                DPoP: "proof",
                "X-Forwarded-Proto": "https",
                "X-Forwarded-Host": "public.example"
            }
        });
        const trusted = metadata(req, true);
        const untrusted = metadata(req, false);
        assert(trusted.scheme === "DPoP");
        assert(untrusted.scheme === "DPoP");
        assert.equal(trusted.expectedHtu, "https://public.example/todos");
        assert.equal(untrusted.expectedHtu, "http://internal.example/todos");
        assert.strictEqual(metadata(req, true), trusted);
        assert.strictEqual(metadata(req, false), untrusted);
        assert.notStrictEqual(trusted, untrusted);
    });
});
