import { NextRequest, NextResponse, type NextProxy } from "next/server.js";
import type { ProxyMatcher } from "next/dist/build/analysis/get-page-static-info.js";
import { getMiddlewareRouteMatcher } from "next/dist/shared/lib/router/utils/middleware-route-matcher.js";
import { getRootingCookies } from "../core/RoutingCookie";
import { getIsOidcSpaStateUrlParamValue } from "../core/StateData";
import { toFullyQualifiedUrl } from "../tools/toFullyQualifiedUrl";
import { buildValidRedirectUri } from "../core/earlyInit_homeUrlAndValidRedirectUri";
import { assert } from "../tools/tsafe/assert";

/** Fetch the return page so Next renders its router state using the URL earlyInit will restore. */
export async function proxy(request: NextRequest) {
    // Keep this routing aligned with tanstack-start-react/withOidcSpaServerEntry.ts.
    const rootRelativeUrls = (() => {
        const homeUrl = toFullyQualifiedUrl({
            urlish: process.env.OIDC_SPA_NEXTJS_BASE_URL!,
            doAssertNoQueryParams: true,
            doOutputWithTrailingSlash: true,
            rootUrl_fullyQualified: "http://localhost"
        });

        let validRedirectUri: string;

        try {
            validRedirectUri = buildValidRedirectUri({
                homeUrl,
                redirectUriPath: process.env.OIDC_SPA_NEXTJS_REDIRECT_URI_PATH!
            });
        } catch {
            // Leave invalid configuration to the client's detailed error handling.
            return undefined;
        }

        const toRootRelative = (url: string) => new URL(url).pathname;

        return {
            rootRelativeHomeUrl: toRootRelative(homeUrl),
            rootRelativeValidRedirectUri: toRootRelative(validRedirectUri)
        };
    })();

    if (rootRelativeUrls === undefined) {
        return NextResponse.next();
    }

    const { rootRelativeHomeUrl, rootRelativeValidRedirectUri } = rootRelativeUrls;

    handle: {
        // request.url includes Next's basePath; nextUrl.pathname does not.
        const url = new URL(request.url);

        if (url.pathname !== rootRelativeValidRedirectUri) {
            break handle;
        }

        if (request.method !== "GET" && request.method !== "HEAD") {
            break handle;
        }

        const stateUrlParamValue = url.searchParams.get("state");

        const isForUs = (() => {
            if (stateUrlParamValue === null) {
                return false;
            }

            const isOidcSpaState = getIsOidcSpaStateUrlParamValue({
                maybeStateUrlParamValue: stateUrlParamValue
            });

            return isOidcSpaState;
        })();

        if (!isForUs) {
            if (rootRelativeHomeUrl === rootRelativeValidRedirectUri) {
                break handle;
            }

            return fetchDocument(new Request(new URL(rootRelativeHomeUrl, url.origin).href, request));
        }

        assert(stateUrlParamValue !== null, "392203");

        const { routingCookies } = getRootingCookies({
            cookieHeaderParamValue: request.headers.get("cookie")
        });

        const entry = routingCookies.find(entry => entry.stateUrlParamValue === stateUrlParamValue);

        if (entry === undefined) {
            if (rootRelativeHomeUrl === rootRelativeValidRedirectUri) {
                const url_withAuthResponseCleared = new URL(url);

                for (const name of [
                    "state",
                    "session_state",
                    "code",
                    "iss",
                    "error",
                    "error_description",
                    "error_uri"
                ]) {
                    url_withAuthResponseCleared.searchParams.delete(name);
                }

                return fetchDocument(new Request(url_withAuthResponseCleared.href, request));
            }

            return fetchDocument(new Request(new URL(rootRelativeHomeUrl, url.origin).href, request));
        }

        const { rootRelativeReturnToUrl } = entry.routingCookie;

        let url_new: URL;

        try {
            url_new = new URL(rootRelativeReturnToUrl, url.origin);
        } catch {
            break handle;
        }

        if (
            url_new.username !== "" ||
            url_new.password !== "" ||
            url_new.origin !== url.origin ||
            (url_new.pathname !== rootRelativeHomeUrl.slice(0, -1) &&
                !url_new.pathname.startsWith(rootRelativeHomeUrl))
        ) {
            break handle;
        }

        return fetchDocument(new Request(url_new.href, request));
    }

    return NextResponse.next();

    // Next forwards through HTTP so its renderer sees the destination URL. Keep
    // this transport separate from the callback routing duplicated above.
    async function fetchDocument(request_new: Request) {
        const returnToUrl = new URL(request_new.url);
        const stateUrlParamValue = new URL(request.url).searchParams.get("state");

        // Fragments belong to the browser and must not be forwarded to the renderer.
        returnToUrl.hash = "";
        const headers = new Headers(request_new.headers);

        // Keep session cookies, including deployment protection cookies, but remove this
        // callback's routing cookie from the internal request to prevent recursion.
        headers.set(
            "cookie",
            (headers.get("cookie") ?? "")
                .split(";")
                .filter(part => part.split("=")[0].trim() !== `oidc_rte_${stateUrlParamValue}`)
                .join(";")
        );

        // These describe the original connection or a cached/client-router response,
        // whereas this request needs a complete document for the return URL.
        for (const name of [
            ...(headers.get("connection") ?? "")
                .split(",")
                .map(name => name.trim())
                .filter(Boolean),
            "host",
            "connection",
            "keep-alive",
            "proxy-authenticate",
            "proxy-authorization",
            "te",
            "trailer",
            "transfer-encoding",
            "upgrade",
            "content-length",
            "accept-encoding",
            "if-none-match",
            "if-modified-since",
            "range",
            "if-range",
            "rsc",
            "next-url",
            "next-router-state-tree",
            "next-router-prefetch",
            "next-router-segment-prefetch",
            "x-nextjs-data"
        ]) {
            headers.delete(name);
        }

        const fetched = await fetch(returnToUrl, {
            method: request_new.method,
            headers,
            cache: "no-store",
            // A redirect issued by the app remains a browser redirect, as for ordinary requests.
            redirect: "manual",
            signal: request.signal
        });
        const response = new NextResponse(request_new.method === "HEAD" ? null : fetched.body, {
            status: fetched.status,
            statusText: fetched.statusText,
            headers: fetched.headers
        });

        for (const name of [
            ...(response.headers.get("connection") ?? "")
                .split(",")
                .map(name => name.trim())
                .filter(Boolean),
            "connection",
            "keep-alive",
            "proxy-authenticate",
            "proxy-authorization",
            "te",
            "trailer",
            "transfer-encoding",
            "upgrade",
            // fetch decompresses the body; these would describe the encoded response.
            "content-encoding",
            "content-length"
        ]) {
            response.headers.delete(name);
        }
        const location = response.headers.get("location");

        if (location !== null && URL.canParse(location, returnToUrl)) {
            response.headers.set("location", new URL(location, returnToUrl).href);
        }

        response.headers.set("Cache-Control", "private, no-store");

        for (const name of ["CDN-Cache-Control", "Vercel-CDN-Cache-Control"]) {
            if (response.headers.has(name)) {
                response.headers.set(name, "no-store");
            }
        }

        return response;
    }
}

/** Compose with a user's proxy, applying its original matchers to the restored destination. */
export function withOidcSpaProxy(
    proxy_user_module: NextProxy | { proxy?: NextProxy; default?: NextProxy },
    matchers_user?: ProxyMatcher[]
): NextProxy {
    const proxy_user =
        typeof proxy_user_module === "function"
            ? proxy_user_module
            : proxy_user_module.proxy ?? proxy_user_module.default;

    if (typeof proxy_user !== "function") {
        throw new Error(
            "oidc-spa: The custom proxy module must export a proxy function or a default function."
        );
    }

    const matches = matchers_user === undefined ? undefined : getMiddlewareRouteMatcher(matchers_user);

    return async (request, event) => {
        const response_oidc = await proxy(request);

        // The forwarded destination request runs the custom proxy itself, once,
        // with Next's normal request and response handling.
        if (response_oidc.headers.get("x-middleware-next") !== "1") {
            return response_oidc;
        }

        const url = new URL(request.url);

        if (
            matches !== undefined &&
            !matches(
                url.pathname,
                { headers: Object.fromEntries(request.headers) } as Parameters<typeof matches>[1],
                Object.fromEntries(url.searchParams)
            )
        ) {
            return response_oidc;
        }

        return (await proxy_user(request, event)) ?? response_oidc;
    };
}
