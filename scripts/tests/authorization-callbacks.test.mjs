import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";
import { test } from "node:test";
import { build } from "esbuild";

async function bundle(contents, stubs = {}) {
    const { outputFiles } = await build({
        stdin: { contents, resolveDir: fileURLToPath(new URL("../../", import.meta.url)) },
        bundle: true,
        platform: "node",
        format: "cjs",
        write: false,
        plugins: [
            {
                name: "auth-fixture",
                setup(build) {
                    build.onResolve({ filter: /.*/ }, ({ path }) =>
                        Object.hasOwn(stubs, path) ? { path, namespace: "fixture" } : undefined
                    );
                    build.onLoad({ filter: /.*/, namespace: "fixture" }, ({ path }) => ({
                        contents: stubs[path]
                    }));
                }
            }
        ]
    });
    return outputFiles[0].text;
}

function load(source, globals = {}) {
    const module = { exports: {} };
    runInNewContext(source, {
        module,
        require: createRequire(import.meta.url),
        console,
        URL,
        URLSearchParams,
        Request,
        Response,
        Event,
        MessageEvent,
        setTimeout,
        clearTimeout,
        ...globals
    });
    return module.exports;
}

// Isolate each browser startup. Only the deferred core import is replaced;
// callback handling, state parsing, cookies and the server entry run unchanged.
const callbackSource = await bundle(
    `
    export * from "./src/core/StateDataCookie";
    export { oidcEarlyInit } from "./src/core/earlyInit";
    export { getRootRelativeOriginalLocationHref_earlyInit } from "./src/core/earlyInit_rootRelativeOriginalLocationHref";
    export { __withOidcSpaServerEntry } from "./src/tanstack-start/react/withOidcSpaServerEntry";
`,
    {
        "./earlyInit_prModuleCreateOidc": `export const prModuleCreateOidc = Promise.resolve({
        registerExports_earlyInit: exports => globalThis.registerEarlyInit(exports)
    });`
    }
);

const state = "b2lkYy1zcGEu".padEnd(32, "a");
const destination = "/app/account-auth0?tab=security#methods";
const cookieValue = `${Math.floor(Date.now() / 1000)}%_${encodeURIComponent(destination)}`;

function browser(authResponse, data) {
    const location = new URL("https://app.test/app/");
    location.search = new URLSearchParams(authResponse).toString();
    const history = {
        replaceState: (_state, _title, url) => {
            location.href = new URL(url, location).href;
        }
    };
    const document = { cookie: "" };
    const record = {};
    const parent = {
        postMessage: (message, origin) => {
            record.message = { message, origin };
        }
    };
    const api = load(callbackSource, {
        window: { location, document, addEventListener() {} },
        location,
        history,
        document,
        navigator: {},
        parent,
        top: parent,
        localStorage: { getItem: key => (key === `oidc.${state}` ? JSON.stringify({ data }) : null) },
        registerEarlyInit: exports => {
            record.earlyInit = exports;
        }
    });
    return { api, location, document, record };
}

for (const legacy of [false, true]) {
    for (const error of [undefined, "consent_required", "access_denied"]) {
        test(`callback preserves the destination: ${error ?? "success"}, legacy=${legacy}`, async () => {
            const authResponse = { state, ...(error ? { error } : { code: "code" }) };
            const data = {
                context: "redirect",
                action: "login",
                configId: "app",
                authorizationParams: {},
                rootRelativeReturnToUrl: destination,
                ...(legacy ? { rootRelativeReturnToUrl_consentRequiredCase: "/app/public" } : {})
            };
            const { api, location, record } = browser(authResponse, data);
            assert.equal(api.oidcEarlyInit({ BASE_URL: "/app/" }).shouldLoadApp, true);
            assert.equal(location.href, `https://app.test${destination}`);
            assert.equal(api.getRootRelativeOriginalLocationHref_earlyInit(), destination);
            await Promise.resolve();
            assert.equal(
                JSON.stringify(record.earlyInit.getRedirectAuthResponse().authResponse),
                JSON.stringify(authResponse)
            );

            const cookie = `oidc_${state}=${cookieValue}${legacy ? "%_%2Fapp%2Fpublic" : ""}`;
            const parsed = api.getStateDataCookies({ cookieHeaderParamValue: cookie });
            assert.equal(parsed.unparsableCookieNames.length, 0);
            assert.equal(
                parsed.stateDataCookies[0].stateDataCookie.rootRelativeReturnToUrl,
                destination
            );

            let renderedRequest;
            const server = api.__withOidcSpaServerEntry({
                fetch: request => {
                    renderedRequest = request;
                    return Response.json({ ok: true });
                }
            });
            await server.fetch(
                new Request(`https://app.test/app/?${new URLSearchParams(authResponse)}`, {
                    headers: { cookie, "X-Fixture": "preserved" }
                })
            );
            assert.equal(renderedRequest.url, location.href);
            assert.equal(renderedRequest.headers.get("X-Fixture"), "preserved");
        });
    }
}

test("cookies serialize one destination and preserve query and fragment", () => {
    const { api, document } = browser({}, undefined);
    api.enableStateDataCookie();
    api.setStateDataCookieIfEnabled({
        homeUrl: "https://app.test/app/",
        stateUrlParamValue_instance: state,
        stateDataCookie: { rootRelativeReturnToUrl: destination }
    });
    assert.equal(document.cookie.split(";")[0].split("%_").length, 2);
    const parsed = api.getStateDataCookies({ cookieHeaderParamValue: document.cookie });
    assert.equal(parsed.stateDataCookies[0].stateDataCookie.rootRelativeReturnToUrl, destination);
    assert.deepEqual(Object.keys(parsed.stateDataCookies[0].stateDataCookie), [
        "rootRelativeReturnToUrl"
    ]);
});

test("logout still restores its requested destination", () => {
    const { api, location } = browser(
        { state },
        {
            context: "redirect",
            action: "logout",
            configId: "app",
            rootRelativeReturnToUrl: destination
        }
    );
    assert.equal(api.oidcEarlyInit({ BASE_URL: "/app/" }).shouldLoadApp, true);
    assert.equal(location.href, `https://app.test${destination}`);
});

test("iframe errors are posted to the parent without loading the application", () => {
    const { api, record } = browser(
        { state, error: "consent_required" },
        {
            context: "iframe",
            configId: "app"
        }
    );
    assert.equal(api.oidcEarlyInit({ BASE_URL: "/app/" }).shouldLoadApp, false);
    assert.equal(record.message.origin, "https://app.test");
    assert(record.message.message.endsWith(JSON.stringify({ state, error: "consent_required" })));
});

test("the server leaves ordinary requests and unmatched callbacks unchanged", async () => {
    const { __withOidcSpaServerEntry } = load(callbackSource);
    for (const query of ["", `?state=${state}&error=consent_required`]) {
        const request = new Request(`https://app.test/app/${query}`);
        const opts = {};
        const response = new Response("unchanged");
        const server = __withOidcSpaServerEntry({
            fetch: (received, receivedOpts) => {
                assert.equal(received, request);
                assert.equal(receivedOpts, opts);
                return response;
            }
        });
        assert.equal(await server.fetch(request, opts), response);
    }
});
