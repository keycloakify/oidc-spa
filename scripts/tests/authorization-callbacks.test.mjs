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
    export * from "./src/core/RoutingCookie";
    export { oidcEarlyInit } from "./src/entrypoint";
    export { getRootRelativeOriginalLocationHref_earlyInit } from "./src/core/earlyInit_rootRelativeOriginalLocationHref";
    export { withOidcSpaServerEntry } from "./src/tanstack-start-react/withOidcSpaServerEntry";
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

function browser(authResponse, data, { redirectUriPath = "/", responseMode = "query" } = {}) {
    const location = new URL(`https://app.test/app/${redirectUriPath.slice(1)}`);
    location[responseMode === "query" ? "search" : "hash"] = new URLSearchParams(
        authResponse
    ).toString();
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
        localStorage: {
            getItem: key =>
                key === `oidc.${state}` && data !== undefined ? JSON.stringify({ data }) : null
        },
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

            const cookie = `oidc_rte_${state}=${cookieValue}${legacy ? "%_%2Fapp%2Fpublic" : ""}`;
            const parsed = api.getRootingCookies({ cookieHeaderParamValue: cookie });
            assert.equal(parsed.unparsableCookieNames.length, 0);
            assert.equal(parsed.routingCookies[0].routingCookie.rootRelativeReturnToUrl, destination);

            let renderedRequest;
            const server = api.withOidcSpaServerEntry({
                serverEntry_original: {
                    fetch: request => {
                        renderedRequest = request;
                        return Response.json({ ok: true });
                    }
                },
                resolvedConfigBase: "/app/",
                oidcSpaVitePluginParams_redirectUriPath: "/openid-callback/"
            });
            await server.fetch(
                new Request(
                    `https://app.test/app/openid-callback/?${new URLSearchParams(authResponse)}`,
                    {
                        headers: { cookie, "X-Fixture": "preserved" }
                    }
                )
            );
            assert.equal(renderedRequest.url, location.href);
            assert.equal(renderedRequest.headers.get("X-Fixture"), "preserved");
        });
    }
}

test("cookies serialize one destination and preserve query and fragment", () => {
    const { api, document } = browser({}, undefined);
    api.setRoutingCookie({
        homeUrl: "https://app.test/app/",
        stateUrlParamValue_instance: state,
        routingCookie: { rootRelativeReturnToUrl: destination }
    });
    assert.equal(document.cookie.split(";")[0].split("%_").length, 2);
    const parsed = api.getRootingCookies({ cookieHeaderParamValue: document.cookie });
    assert.equal(parsed.routingCookies[0].routingCookie.rootRelativeReturnToUrl, destination);
    assert.deepEqual(Object.keys(parsed.routingCookies[0].routingCookie), ["rootRelativeReturnToUrl"]);
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
    const { withOidcSpaServerEntry } = load(callbackSource);
    for (const query of ["", `?state=${state}&error=consent_required`]) {
        const request = new Request(`https://app.test/app/${query}`);
        const opts = {};
        const response = new Response("unchanged");
        const server = withOidcSpaServerEntry({
            serverEntry_original: {
                fetch: (received, receivedOpts) => {
                    assert.equal(received, request);
                    assert.equal(receivedOpts, opts);
                    return response;
                }
            },
            resolvedConfigBase: "/app/",
            oidcSpaVitePluginParams_redirectUriPath: "/openid-callback/"
        });
        assert.equal(await server.fetch(request, opts), response);
    }
});

test("cookie destinations containing credentials leave the original request unchanged", async () => {
    const { withOidcSpaServerEntry } = load(callbackSource);
    const opts = {};
    const response = new Response("unchanged");
    let calls = 0;
    let expectedRequest;
    const server = withOidcSpaServerEntry({
        serverEntry_original: {
            fetch(request, requestOpts) {
                calls++;
                assert.equal(request, expectedRequest);
                assert.equal(requestOpts, opts);
                return response;
            }
        },
        resolvedConfigBase: "/app/",
        oidcSpaVitePluginParams_redirectUriPath: "/openid-callback/"
    });

    for (const authority of ["user@", ":pass@", "user:pass@"]) {
        const destination = `//${authority}app.test/app/account`;
        expectedRequest = new Request(`https://app.test/app/openid-callback/?state=${state}`, {
            headers: {
                cookie: `oidc_rte_${state}=1%_${encodeURIComponent(destination)}`
            }
        });
        assert.equal(await server.fetch(expectedRequest, opts), response);
    }
    assert.equal(calls, 3);
});

test("the server accepts the exact application base without a trailing slash", async () => {
    const { withOidcSpaServerEntry } = load(callbackSource);
    let received;
    const server = withOidcSpaServerEntry({
        serverEntry_original: {
            fetch(request) {
                received = request;
                return new Response("ok");
            }
        },
        resolvedConfigBase: "/app/",
        oidcSpaVitePluginParams_redirectUriPath: "/openid-callback/"
    });

    for (const destination of ["/app", "/app/", "/app/account", "/application", "/app2/account"]) {
        const request = new Request(`https://app.test/app/openid-callback/?state=${state}`, {
            headers: { cookie: `oidc_rte_${state}=1%_${encodeURIComponent(destination)}` }
        });
        await server.fetch(request);
        if (["/app", "/app/", "/app/account"].includes(destination)) {
            assert.equal(received.url, `https://app.test${destination}`);
        } else {
            assert.equal(received, request);
        }
    }
});

for (const redirectUriPath of ["/", "/openid-callback/"]) {
    for (const responseMode of ["query", "fragment"]) {
        for (const context of ["redirect", "iframe"]) {
            test(`callback: ${responseMode}, ${context}, redirectUriPath=${redirectUriPath}`, async () => {
                const authResponse = { state, code: "code" };
                const data =
                    context === "iframe"
                        ? { context, configId: "app" }
                        : {
                              context,
                              action: "login",
                              configId: "app",
                              authorizationParams: {},
                              rootRelativeReturnToUrl: destination
                          };
                const { api, location, record } = browser(authResponse, data, {
                    redirectUriPath,
                    responseMode
                });
                assert.equal(
                    api.oidcEarlyInit({ BASE_URL: "/app/", redirectUriPath }).shouldLoadApp,
                    context === "redirect"
                );
                await Promise.resolve();
                if (context === "redirect") {
                    assert.equal(location.href, `https://app.test${destination}`);
                    assert.equal(record.earlyInit.getRedirectAuthResponse().authResponse.code, "code");
                } else {
                    assert(record.message.message.endsWith(JSON.stringify(authResponse)));
                }
            });
        }
    }
}

test("ordinary home visits retain query parameters and fragments", () => {
    const { api, location } = browser({}, undefined);
    location.search = "?tab=security";
    location.hash = "#methods";
    assert.equal(api.oidcEarlyInit({ BASE_URL: "/app/" }).shouldLoadApp, true);
    assert.equal(location.href, "https://app.test/app/?tab=security#methods");
});

for (const responseMode of ["query", "fragment"]) {
    test(`ordinary application state in the ${responseMode} is preserved`, () => {
        const { api, location } = browser(
            { state: "ordinary-application-state", tab: "security" },
            undefined,
            { responseMode }
        );
        const originalUrl = location.href;
        assert.equal(api.oidcEarlyInit({ BASE_URL: "/app/" }).shouldLoadApp, true);
        assert.equal(location.href, originalUrl);
        assert.equal(
            api.getRootRelativeOriginalLocationHref_earlyInit(),
            originalUrl.slice(location.origin.length)
        );
    });

    test(`a foreign authorization code in the ${responseMode} is still rejected`, () => {
        const { api, location } = browser({ state: "foreign-state", code: "foreign-code" }, undefined, {
            responseMode
        });
        assert.equal(api.oidcEarlyInit({ BASE_URL: "/app/" }).shouldLoadApp, false);
        assert.equal(location.href, "https://app.test/app/");
    });
}

for (const redirectUriPath of ["/../outside/", "/%2e%2e/outside/", "/#fragment/", "/?tab=security/"]) {
    test(`invalid redirect path gives a client configuration error: ${redirectUriPath}`, () => {
        const { api } = browser({}, undefined);
        assert.throws(
            () => api.oidcEarlyInit({ BASE_URL: "/app/", redirectUriPath }),
            /oidc-spa: Configuration Error, redirectUriPath.*(?:outside|query parameters or a fragment)/
        );
    });
}

for (const redirectUriPath of ["/", "/openid-callback/", "/nested/../callback/"]) {
    test(`valid callback subpath is accepted: ${redirectUriPath}`, () => {
        const { api } = browser({}, undefined);
        assert.equal(api.oidcEarlyInit({ BASE_URL: "/app/", redirectUriPath }).shouldLoadApp, true);
    });

    for (const invalidCookie of [false, true]) {
        for (const extraQuery of [false, true]) {
            for (const response of [{ code: "expired" }, { error: "login_required" }, {}]) {
                test(`expired callback handles missing or invalid routing metadata: ${redirectUriPath}, invalidCookie=${invalidCookie}, extraQuery=${extraQuery}, ${JSON.stringify(
                    response
                )}`, async () => {
                    const { api, location } = browser(
                        { state, ...response, ...(extraQuery ? { tab: "security" } : {}) },
                        undefined,
                        { redirectUriPath }
                    );
                    const headers = invalidCookie
                        ? { cookie: `oidc_rte_${state}=1%_${encodeURIComponent("/elsewhere/")}` }
                        : undefined;
                    const request = new Request(location.href, { headers });
                    assert.equal(
                        api.oidcEarlyInit({ BASE_URL: "/app/", redirectUriPath }).shouldLoadApp,
                        true
                    );
                    let renderedUrl;
                    const server = api.withOidcSpaServerEntry({
                        serverEntry_original: {
                            fetch(request) {
                                renderedUrl = request.url;
                                return new Response("ok");
                            }
                        },
                        resolvedConfigBase: "/app/",
                        oidcSpaVitePluginParams_redirectUriPath: redirectUriPath
                    });
                    await server.fetch(request);
                    const expectedUrl =
                        "https://app.test/app/" +
                        (redirectUriPath === "/" && extraQuery ? "?tab=security" : "");
                    assert.equal(location.href, expectedUrl);
                    assert.equal(renderedUrl, invalidCookie ? request.url : expectedUrl);
                });
            }
        }
    }
}

test("creation, explicit deletion and stale cleanup use the application base path", () => {
    const { api, document } = browser({}, undefined);
    const writes = [];
    Object.defineProperty(document, "cookie", {
        get: () => "oidc_rte_stale=1%_%2Fapp%2Faccount; oidc_rte_invalid=unparseable",
        set: value => writes.push(value)
    });
    const homeUrl = "https://app.test/app/";
    api.setRoutingCookie({
        homeUrl,
        stateUrlParamValue_instance: state,
        routingCookie: { rootRelativeReturnToUrl: destination }
    });
    api.clearRoutingCookie({ homeUrl, stateUrlParamValue: state });
    assert.equal(writes.length, 4);
    for (const value of writes) assert.match(value, /Path=\/app\/(?:;|$)/);
    assert.equal(writes.filter(value => value.includes("Max-Age=0")).length, 3);
});
