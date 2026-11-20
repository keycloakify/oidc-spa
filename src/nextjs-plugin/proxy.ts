import { NextRequest, NextResponse, type NextProxy } from "next/server.js";
import type { ProxyMatcher } from "next/dist/build/analysis/get-page-static-info.js";
import { getMiddlewareRouteMatcher } from "next/dist/shared/lib/router/utils/middleware-route-matcher.js";
import { getStateDataCookies } from "../core/StateDataCookie";

/** Fetch the return page so Next renders its router state using the URL earlyInit will restore. */
export async function proxy(request: NextRequest) {
    if (request.method !== "GET" || request.nextUrl.pathname !== "/") {
        return NextResponse.next();
    }

    const stateUrlParamValue = request.nextUrl.searchParams.get("state");

    if (stateUrlParamValue === null) {
        return NextResponse.next();
    }

    const { stateDataCookies } = getStateDataCookies({
        cookieHeaderParamValue: request.headers.get("cookie")
    });
    const entry = stateDataCookies.find(entry => entry.stateUrlParamValue === stateUrlParamValue);

    if (entry === undefined) {
        return NextResponse.next();
    }

    const { rootRelativeReturnToUrl } = entry.stateDataCookie;
    const url = new URL(request.url);

    if (!rootRelativeReturnToUrl.startsWith("/") || !URL.canParse(rootRelativeReturnToUrl, url.origin)) {
        return NextResponse.next();
    }

    const returnToUrl = new URL(rootRelativeReturnToUrl, url.origin);
    const basePath = request.nextUrl.basePath;

    if (
        returnToUrl.origin !== url.origin ||
        (basePath !== "" &&
            returnToUrl.pathname !== basePath &&
            !returnToUrl.pathname.startsWith(`${basePath}/`))
    ) {
        return NextResponse.next();
    }

    // Fragments belong to the browser and must not be forwarded to the renderer.
    returnToUrl.hash = "";
    const headers = new Headers(request.headers);

    // Keep session cookies, including deployment protection cookies, but remove this
    // callback's routing cookie from the internal request to prevent recursion.
    headers.set(
        "cookie",
        (headers.get("cookie") ?? "")
            .split(";")
            .filter(part => part.split("=")[0].trim() !== `oidc_${stateUrlParamValue}`)
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
        headers,
        cache: "no-store",
        // A redirect issued by the app remains a browser redirect, as for ordinary requests.
        redirect: "manual",
        signal: request.signal
    });
    const response = new NextResponse(fetched.body, {
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
