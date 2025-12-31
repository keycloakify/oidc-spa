import { assert } from "../tools/tsafe/assert";
import {
    markTokenSubstitutionAsEnabled,
    substitutePlaceholderByRealToken
} from "./tokenPlaceholderSubstitution";
import { getIsHostnameAuthorized } from "../tools/isHostnameAuthorized";
import { getIsLikelyDevServer } from "../tools/isLikelyDevServer";

type Params = {
    resourceServersAllowedHostnames: string[] | undefined;
    serviceWorkersAllowedHostnames: string[] | undefined;
};

const viteHashedJsAssetPathRegExp = /\/assets\/[^/]+-[a-zA-Z0-9_-]{8}\.js$/;

export function enableTokenExfiltrationDefense(params: Params) {
    const { resourceServersAllowedHostnames = [], serviceWorkersAllowedHostnames = [] } = params;

    markTokenSubstitutionAsEnabled();

    patchFetchApiToSubstituteTokenPlaceholder({ resourceServersAllowedHostnames });
    patchXMLHttpRequestApiToSubstituteTokenPlaceholder({ resourceServersAllowedHostnames });
    patchWebSocketApiToSubstituteTokenPlaceholder({ resourceServersAllowedHostnames });
    patchEventSourceApiToSubstituteTokenPlaceholder({ resourceServersAllowedHostnames });
    patchNavigatorSendBeaconApiToSubstituteTokenPlaceholder({ resourceServersAllowedHostnames });
    restrictServiceWorkerRegistration({ serviceWorkersAllowedHostnames });

    runMonkeyPatchingPrevention();
}

function patchFetchApiToSubstituteTokenPlaceholder(params: {
    resourceServersAllowedHostnames: string[];
}) {
    const { resourceServersAllowedHostnames } = params;

    const fetch_actual = window.fetch;
    //@ts-expect-error
    const fetchLater_actual: typeof fetch_actual | undefined = window.fetchLater;

    const createFetchOrFetchLater = (params: { isFetchLater: boolean }) => {
        const { isFetchLater } = params;

        const fn: typeof fetch_actual = async (input, init) => {
            const request = input instanceof Request ? input : new Request(input, init);

            let didSubstitute = false;

            let url: string;

            {
                const url_before = `${request.url}`;

                url = substitutePlaceholderByRealToken(url_before);

                if (url !== url_before) {
                    didSubstitute = true;
                }
            }

            prevent_fetching_of_hashed_js_assets: {
                const { pathname } = new URL(url, window.location.href);

                if (!viteHashedJsAssetPathRegExp.test(pathname)) {
                    break prevent_fetching_of_hashed_js_assets;
                }

                throw new Error("oidc-spa: Blocked request to hashed js static asset.");
            }

            const headers = new Headers();
            request.headers.forEach((value, key) => {
                const nextValue = substitutePlaceholderByRealToken(value);

                if (nextValue !== value) {
                    didSubstitute = true;
                }

                headers.set(key, nextValue);
            });

            let body: BodyInit | undefined;

            handle_body: {
                from_init: {
                    if (!init) {
                        break from_init;
                    }

                    if (!init.body) {
                        break from_init;
                    }

                    if (input instanceof Request && input.body !== null) {
                        break from_init;
                    }

                    if (typeof init.body === "string") {
                        body = substitutePlaceholderByRealToken(init.body);

                        if (init.body !== body) {
                            didSubstitute = true;
                        }

                        break handle_body;
                    }

                    if (init.body instanceof URLSearchParams) {
                        let didUrlSearchParamsSubstitute = false;
                        const next = new URLSearchParams();

                        init.body.forEach((value, key) => {
                            const nextValue = substitutePlaceholderByRealToken(value);

                            if (nextValue !== value) {
                                didUrlSearchParamsSubstitute = true;
                            }

                            next.append(key, nextValue);
                        });

                        if (didUrlSearchParamsSubstitute) {
                            didSubstitute = true;
                        }

                        body = didUrlSearchParamsSubstitute ? next : init.body;

                        break handle_body;
                    }

                    if (init.body instanceof FormData) {
                        let didFormDataSubstitute = false;
                        const next = new FormData();

                        init.body.forEach((value, key) => {
                            if (typeof value === "string") {
                                const nextValue = substitutePlaceholderByRealToken(value);

                                if (nextValue !== value) {
                                    didFormDataSubstitute = true;
                                }

                                next.append(key, nextValue);

                                return;
                            }

                            next.append(key, value);
                        });

                        if (didFormDataSubstitute) {
                            didSubstitute = true;
                        }

                        body = didFormDataSubstitute ? next : init.body;

                        break handle_body;
                    }

                    if (init.body instanceof Blob) {
                        break from_init;
                    }

                    body = init.body;
                    break handle_body;
                }

                if (request.body === null) {
                    body = undefined;
                    break handle_body;
                }

                const shouldInspectBody = (() => {
                    let ct = headers.get("Content-Type");

                    if (ct === null) {
                        return false;
                    }

                    ct = ct.toLocaleLowerCase();

                    if (
                        !ct.startsWith("application/json") &&
                        !ct.startsWith("application/x-www-form-urlencoded")
                    ) {
                        return false;
                    }

                    const len_str = headers.get("Content-Length");

                    if (len_str === null) {
                        // NOTE: This will have performance implications for large bodies
                        // but we have no other way to know the size
                        return true;
                    }

                    const len = parseInt(len_str, 10);

                    if (!Number.isFinite(len) || len > 100_000) {
                        return false;
                    }

                    return true;
                })();

                if (!shouldInspectBody) {
                    body = request.body;
                    break handle_body;
                }

                const bodyText = await request.clone().text();
                const nextBodyText = substitutePlaceholderByRealToken(bodyText);

                if (nextBodyText !== bodyText) {
                    didSubstitute = true;
                }

                body = nextBodyText;
            }

            block_authed_request_to_unauthorized_hostnames: {
                if (!didSubstitute) {
                    break block_authed_request_to_unauthorized_hostnames;
                }

                const { hostname } = new URL(url, window.location.href);

                if (
                    getIsHostnameAuthorized({
                        allowedHostnames: resourceServersAllowedHostnames,
                        extendAuthorizationToParentDomain: true,
                        hostname
                    })
                ) {
                    break block_authed_request_to_unauthorized_hostnames;
                }

                throw new Error(
                    [
                        `oidc-spa: Blocked authed request to ${hostname}.`,
                        `To authorize this request add "${hostname}" to`,
                        "`resourceServersAllowedHostnames`."
                    ].join(" ")
                );
            }

            const method = request.method.toUpperCase();

            const nextInit: RequestInit = {
                method: request.method,
                headers,
                // NOTE: Firefox strictly enforces HTTP spec - GET/HEAD requests cannot have a body
                ...(method !== "GET" && method !== "HEAD" && body !== undefined ? { body } : {}),
                mode: request.mode,
                credentials: request.credentials,
                cache: request.cache,
                redirect: request.redirect,
                referrer: request.referrer,
                referrerPolicy: request.referrerPolicy,
                integrity: request.integrity,
                keepalive: request.keepalive,
                signal: request.signal
            };

            {
                //@ts-expect-error
                const duplex = init?.duplex ?? (input instanceof Request ? input.duplex : undefined);

                if (duplex !== undefined) {
                    //@ts-expect-error
                    nextInit.duplex = duplex;
                }
            }

            fetch_later: {
                if (!isFetchLater) {
                    break fetch_later;
                }

                assert(fetchLater_actual !== undefined);

                const activateAfter =
                    //@ts-expect-error
                    init?.activateAfter ?? (input instanceof Request ? input.activateAfter : undefined);

                if (activateAfter !== undefined) {
                    //@ts-expect-error
                    nextInit.activateAfter = activateAfter;
                }

                return fetchLater_actual(url, nextInit);
            }

            return fetch_actual(url, nextInit);
        };

        return fn;
    };

    window.fetch = createFetchOrFetchLater({ isFetchLater: false });
    // @ts-expect-error
    if (window.fetchLater) {
        // @ts-expect-error
        window.fetchLater = createFetchOrFetchLater({ isFetchLater: true });
    }
}

function patchXMLHttpRequestApiToSubstituteTokenPlaceholder(params: {
    resourceServersAllowedHostnames: string[];
}) {
    const { resourceServersAllowedHostnames } = params;

    const open_actual = XMLHttpRequest.prototype.open;
    const send_actual = XMLHttpRequest.prototype.send;
    const setRequestHeader_actual = XMLHttpRequest.prototype.setRequestHeader;

    const stateByInstance = new WeakMap<XMLHttpRequest, { url: string; didSubstitute: boolean }>();

    XMLHttpRequest.prototype.open = function open(
        method: string,
        url: string | URL,
        async?: boolean,
        username?: string | null,
        password?: string | null
    ) {
        const state = { url: "", didSubstitute: false };

        {
            const url_str = `${typeof url === "string" ? url : url.href}`;
            state.url = substitutePlaceholderByRealToken(url_str);
            if (url_str !== state.url) {
                state.didSubstitute = true;
            }
        }

        stateByInstance.set(this, state);

        prevent_fetching_of_hashed_js_assets: {
            const { pathname } = new URL(state.url, window.location.href);

            if (!viteHashedJsAssetPathRegExp.test(pathname)) {
                break prevent_fetching_of_hashed_js_assets;
            }

            throw new Error("oidc-spa: Blocked request to hashed static asset.");
        }

        return open_actual.call(this, method, state.url, async as true, username, password);
    };

    XMLHttpRequest.prototype.setRequestHeader = function setRequestHeader(name, value) {
        const state = stateByInstance.get(this);

        assert(state !== undefined, "29440283");

        const nextValue = substitutePlaceholderByRealToken(value);

        if (nextValue !== value) {
            state.didSubstitute = true;
        }

        return setRequestHeader_actual.call(this, name, nextValue);
    };

    XMLHttpRequest.prototype.send = function send(body) {
        const state = stateByInstance.get(this);

        assert(state !== undefined, "32323484");

        let nextBody = body;

        if (typeof body === "string") {
            const nextBodyText = substitutePlaceholderByRealToken(body);

            if (nextBodyText !== body) {
                state.didSubstitute = true;
            }

            nextBody = nextBodyText;
        }

        block_authed_request_to_unauthorized_hostnames: {
            if (!state.didSubstitute) {
                break block_authed_request_to_unauthorized_hostnames;
            }

            const { hostname } = new URL(state.url, window.location.href);

            if (
                getIsHostnameAuthorized({
                    allowedHostnames: resourceServersAllowedHostnames,
                    extendAuthorizationToParentDomain: true,
                    hostname
                })
            ) {
                break block_authed_request_to_unauthorized_hostnames;
            }

            throw new Error(
                [
                    `oidc-spa: Blocked authed request to ${hostname}.`,
                    `To authorize this request add "${hostname}" to`,
                    "`resourceServersAllowedHostnames`."
                ].join(" ")
            );
        }

        return send_actual.call(this, nextBody as Parameters<XMLHttpRequest["send"]>[0]);
    };
}

function patchWebSocketApiToSubstituteTokenPlaceholder(params: {
    resourceServersAllowedHostnames: string[];
}) {
    const { resourceServersAllowedHostnames } = params;

    const WebSocket_actual = window.WebSocket;
    const send_actual = WebSocket_actual.prototype.send;

    type WsData = {
        url: string;
        hostname: string;
        pathname: string;
        didSubstitute: boolean;
    };

    const stateByInstance = new WeakMap<WebSocket, WsData>();

    const WebSocketPatched = function WebSocket(url: string | URL, protocols?: string | string[]) {
        const urlStr = `${typeof url === "string" ? url : url.href}`;
        const nextUrl = substitutePlaceholderByRealToken(urlStr);
        let didSubstitute = nextUrl !== urlStr;

        const nextProtocols = (() => {
            if (protocols === undefined) {
                return undefined;
            }

            if (typeof protocols === "string") {
                const next = substitutePlaceholderByRealToken(protocols);

                if (next !== protocols) {
                    didSubstitute = true;
                }

                return next;
            }

            let didProtocolSubstitute = false;
            const next: string[] = [];

            for (const p of protocols) {
                const pNext = substitutePlaceholderByRealToken(p);

                if (pNext !== p) {
                    didProtocolSubstitute = true;
                }

                next.push(pNext);
            }

            if (didProtocolSubstitute) {
                didSubstitute = true;
                return next;
            }

            return protocols;
        })();

        const { hostname, pathname } = new URL(nextUrl, window.location.href);

        block_authed_request_to_unauthorized_hostnames: {
            if (!didSubstitute) {
                break block_authed_request_to_unauthorized_hostnames;
            }

            if (
                getIsHostnameAuthorized({
                    allowedHostnames: resourceServersAllowedHostnames,
                    extendAuthorizationToParentDomain: true,
                    hostname
                })
            ) {
                break block_authed_request_to_unauthorized_hostnames;
            }

            throw new Error(
                [
                    `oidc-spa: Blocked authed request to ${hostname}.`,
                    `To authorize this request add "${hostname}" to`,
                    "`resourceServersAllowedHostnames`."
                ].join(" ")
            );
        }

        const instance = new WebSocket_actual(nextUrl, nextProtocols as Parameters<typeof WebSocket>[1]);

        stateByInstance.set(instance, {
            url: nextUrl,
            hostname,
            pathname,
            didSubstitute
        });

        return instance;
    };

    WebSocketPatched.prototype = WebSocket_actual.prototype;

    for (const name of ["CONNECTING", "OPEN", "CLOSING", "CLOSED"] as const) {
        Object.defineProperty(WebSocketPatched, name, {
            value: WebSocket_actual[name],
            writable: false,
            enumerable: true,
            configurable: false
        });
    }

    window.WebSocket = WebSocketPatched as unknown as typeof WebSocket;

    WebSocket_actual.prototype.send = function send(data) {
        const state = stateByInstance.get(this);

        // NOTE: Vite's dev server instantiates a websocket before earlyInit runs.
        if (state === undefined && getIsLikelyDevServer()) {
            return send_actual.call(this, data);
        }

        assert(state !== undefined, "49204832");

        let nextData = data;

        if (typeof data === "string") {
            const nextDataText = substitutePlaceholderByRealToken(data);

            if (nextDataText !== data) {
                state.didSubstitute = true;
            }

            nextData = nextDataText;
        }

        block_authed_request_to_unauthorized_hostnames: {
            if (!state.didSubstitute) {
                break block_authed_request_to_unauthorized_hostnames;
            }

            if (
                getIsHostnameAuthorized({
                    allowedHostnames: resourceServersAllowedHostnames,
                    extendAuthorizationToParentDomain: true,
                    hostname: state.hostname
                })
            ) {
                break block_authed_request_to_unauthorized_hostnames;
            }

            throw new Error(
                [
                    `oidc-spa: Blocked authed request to ${state.hostname}.`,
                    `To authorize this request add "${state.hostname}" to`,
                    "`resourceServersAllowedHostnames`."
                ].join(" ")
            );
        }

        prevent_fetching_of_hashed_js_assets: {
            if (!viteHashedJsAssetPathRegExp.test(state.pathname)) {
                break prevent_fetching_of_hashed_js_assets;
            }

            throw new Error("oidc-spa: Blocked request to hashed static asset.");
        }

        return send_actual.call(this, nextData);
    };
}

function patchEventSourceApiToSubstituteTokenPlaceholder(params: {
    resourceServersAllowedHostnames: string[];
}) {
    const { resourceServersAllowedHostnames } = params;

    const EventSource_actual = window.EventSource;

    if (EventSource_actual === undefined) {
        return;
    }

    const EventSourcePatched = function EventSource(
        url: string | URL,
        eventSourceInitDict?: EventSourceInit
    ) {
        const urlStr = `${typeof url === "string" ? url : url.href}`;
        const nextUrl = substitutePlaceholderByRealToken(urlStr);
        const didSubstitute = nextUrl !== urlStr;

        const { hostname } = new URL(nextUrl, window.location.href);

        block_authed_request_to_unauthorized_hostnames: {
            if (!didSubstitute) {
                break block_authed_request_to_unauthorized_hostnames;
            }

            if (
                getIsHostnameAuthorized({
                    allowedHostnames: resourceServersAllowedHostnames,
                    extendAuthorizationToParentDomain: true,
                    hostname
                })
            ) {
                break block_authed_request_to_unauthorized_hostnames;
            }

            throw new Error(
                [
                    `oidc-spa: Blocked authed request to ${hostname}.`,
                    `To authorize this request add "${hostname}" to`,
                    "`resourceServersAllowedHostnames`."
                ].join(" ")
            );
        }

        return new EventSource_actual(nextUrl, eventSourceInitDict);
    };

    EventSourcePatched.prototype = EventSource_actual.prototype;

    if ("CONNECTING" in EventSource_actual) {
        for (const name of ["CONNECTING", "OPEN", "CLOSED"] as const) {
            Object.defineProperty(EventSourcePatched, name, {
                value: (EventSource_actual as any)[name],
                writable: false,
                enumerable: true,
                configurable: false
            });
        }
    }

    window.EventSource = EventSourcePatched as unknown as typeof EventSource;
}

function patchNavigatorSendBeaconApiToSubstituteTokenPlaceholder(params: {
    resourceServersAllowedHostnames: string[];
}) {
    const { resourceServersAllowedHostnames } = params;

    const sendBeacon_actual = navigator.sendBeacon?.bind(navigator);

    if (sendBeacon_actual === undefined) {
        return;
    }

    navigator.sendBeacon = function sendBeacon(url: string | URL, data?: BodyInit | null) {
        const urlStr = typeof url === "string" ? url : url.href;
        const nextUrl = substitutePlaceholderByRealToken(urlStr);
        let didSubstitute = nextUrl !== urlStr;

        const { hostname } = new URL(nextUrl, window.location.href);

        let nextData = data;

        if (typeof data === "string") {
            const next = substitutePlaceholderByRealToken(data);

            if (next !== data) {
                didSubstitute = true;
            }

            nextData = next;
        } else if (data instanceof URLSearchParams) {
            let didUrlSearchParamsSubstitute = false;
            const next = new URLSearchParams();

            data.forEach((value, key) => {
                const nextValue = substitutePlaceholderByRealToken(value);

                if (nextValue !== value) {
                    didUrlSearchParamsSubstitute = true;
                }

                next.append(key, nextValue);
            });

            if (didUrlSearchParamsSubstitute) {
                didSubstitute = true;
                nextData = next;
            }
        } else if (data instanceof FormData) {
            let didFormDataSubstitute = false;
            const next = new FormData();

            data.forEach((value, key) => {
                if (typeof value === "string") {
                    const nextValue = substitutePlaceholderByRealToken(value);

                    if (nextValue !== value) {
                        didFormDataSubstitute = true;
                    }

                    next.append(key, nextValue);

                    return;
                }

                next.append(key, value);
            });

            if (didFormDataSubstitute) {
                didSubstitute = true;
                nextData = next;
            }
        }

        block_authed_request_to_unauthorized_hostnames: {
            if (!didSubstitute) {
                break block_authed_request_to_unauthorized_hostnames;
            }

            if (
                getIsHostnameAuthorized({
                    allowedHostnames: resourceServersAllowedHostnames,
                    extendAuthorizationToParentDomain: true,
                    hostname
                })
            ) {
                break block_authed_request_to_unauthorized_hostnames;
            }

            throw new Error(
                [
                    `oidc-spa: Blocked authed request to ${hostname}.`,
                    `To authorize this request add "${hostname}" to`,
                    "`resourceServersAllowedHostnames`."
                ].join(" ")
            );
        }

        return sendBeacon_actual(nextUrl, nextData as Parameters<typeof navigator.sendBeacon>[1]);
    };
}

function runMonkeyPatchingPrevention() {
    const createWriteError = (target: string) =>
        new Error(
            [
                `oidc-spa: Monkey patching of ${target} has been blocked.`,
                `Read: https://docs.oidc-spa.dev/v/v8/resources/blocked-monkey-patching`
            ].join(" ")
        );

    for (const name of [
        "fetch",
        "XMLHttpRequest",
        "WebSocket",
        "Headers",
        "URLSearchParams",
        "EventSource",
        "ServiceWorkerContainer",
        "ServiceWorkerRegistration",
        "ServiceWorker",
        "FormData",
        "URL",
        "Request",
        "WeakMap",
        "Blob",
        "String",
        "Object",
        "Promise",
        "Array",
        "RegExp",
        "TextEncoder",
        "Uint8Array",
        "Uint32Array",
        "Response",
        "Reflect",
        "JSON",
        "encodeURIComponent",
        "decodeURIComponent",
        "atob",
        "btoa"
    ] as const) {
        const original = window[name];

        if (!original) {
            continue;
        }

        if ("prototype" in original) {
            for (const propertyName of Object.getOwnPropertyNames(original.prototype)) {
                if (name === "Object") {
                    if (
                        propertyName === "toString" ||
                        propertyName === "constructor" ||
                        propertyName === "valueOf"
                    ) {
                        continue;
                    }
                }

                if (name === "Array") {
                    if (propertyName === "constructor" || propertyName === "concat") {
                        continue;
                    }
                }

                const pd = Object.getOwnPropertyDescriptor(original.prototype, propertyName);

                assert(pd !== undefined);

                if (!pd.configurable) {
                    continue;
                }

                const target = `window.${name}.prototype.${propertyName}`;

                Object.defineProperty(original.prototype, propertyName, {
                    enumerable: pd.enumerable,
                    configurable: false,
                    ...("value" in pd
                        ? {
                              get: () => pd.value,
                              set: () => {
                                  throw createWriteError(target);
                              }
                          }
                        : {
                              get: pd.get,
                              set:
                                  pd.set ??
                                  (() => {
                                      throw createWriteError(target);
                                  })
                          })
                });
            }

            for (const symbol of Object.getOwnPropertySymbols(original.prototype)) {
                const pd = Object.getOwnPropertyDescriptor(original.prototype, symbol);

                assert(pd !== undefined);

                if (!pd.configurable) {
                    continue;
                }

                const target = `window.${name}.prototype[Symbol.${symbol.toString()}]`;

                Object.defineProperty(original.prototype, symbol, {
                    enumerable: pd.enumerable,
                    configurable: false,
                    ...("value" in pd
                        ? {
                              get: () => pd.value,
                              set: () => {
                                  throw createWriteError(target);
                              }
                          }
                        : {
                              get: pd.get,
                              set:
                                  pd.set ??
                                  (() => {
                                      throw createWriteError(target);
                                  })
                          })
                });
            }

            for (const propertyName of Object.getOwnPropertyNames(original)) {
                const pd = Object.getOwnPropertyDescriptor(original, propertyName);

                assert(pd !== undefined);

                if (!pd.configurable) {
                    continue;
                }

                const target = `window.${name}.${propertyName}`;

                Object.defineProperty(original, propertyName, {
                    enumerable: pd.enumerable,
                    configurable: false,
                    ...("value" in pd
                        ? {
                              get: () => pd.value,
                              set: () => {
                                  throw createWriteError(target);
                              }
                          }
                        : {
                              get: pd.get,
                              set:
                                  pd.set ??
                                  (() => {
                                      throw createWriteError(target);
                                  })
                          })
                });
            }

            if (Symbol.iterator in original.prototype) {
                // @ts-expect-error
                const iterator_prototype = Object.getPrototypeOf(new original()[Symbol.iterator]());

                for (const propertyName of Object.getOwnPropertyNames(iterator_prototype)) {
                    const pd = Object.getOwnPropertyDescriptor(iterator_prototype, propertyName);

                    assert(pd !== undefined);

                    if (!pd.configurable) {
                        continue;
                    }

                    const target = `new ${name}()[Symbol.iterator]().__proto__.${propertyName}`;

                    Object.defineProperty(iterator_prototype, propertyName, {
                        enumerable: pd.enumerable,
                        configurable: false,
                        ...("value" in pd
                            ? {
                                  get: () => pd.value,
                                  set: () => {
                                      throw createWriteError(target);
                                  }
                              }
                            : {
                                  get: pd.get,
                                  set:
                                      pd.set ??
                                      (() => {
                                          throw createWriteError(target);
                                      })
                              })
                    });
                }
            }
        }

        Object.defineProperty(window, name, {
            configurable: false,
            enumerable: true,
            get: () => original,
            set: () => {
                throw createWriteError(`window.${name}`);
            }
        });
    }

    crypto_subtle: {
        const { crypto } = window;

        if (!crypto?.subtle) {
            break crypto_subtle;
        }

        const subtle = crypto.subtle;
        const prototype = Object.getPrototypeOf(subtle);

        for (const propertyName of Object.getOwnPropertyNames(prototype)) {
            const pd = Object.getOwnPropertyDescriptor(prototype, propertyName);

            assert(pd !== undefined);

            if (!pd.configurable) {
                continue;
            }

            const target = `window.crypto.subtle.${propertyName}`;

            Object.defineProperty(prototype, propertyName, {
                enumerable: pd.enumerable,
                configurable: false,
                ...("value" in pd
                    ? {
                          get: () => pd.value,
                          set: () => {
                              throw createWriteError(target);
                          }
                      }
                    : {
                          get: pd.get,
                          set:
                              pd.set ??
                              (() => {
                                  throw createWriteError(target);
                              })
                      })
            });
        }

        {
            const subtlePd = Object.getOwnPropertyDescriptor(crypto, "subtle");
            if (subtlePd !== undefined && !subtlePd.configurable) {
                break crypto_subtle;
            }
        }

        Object.defineProperty(crypto, "subtle", {
            configurable: false,
            enumerable: true,
            get: () => subtle,
            set: () => {
                throw createWriteError("window.crypto.subtle");
            }
        });
    }

    {
        const name = "serviceWorker";

        const original = navigator[name];

        Object.defineProperty(navigator, name, {
            configurable: false,
            enumerable: true,
            get: () => original,
            set: () => {
                throw createWriteError(`window.navigator.${name}`);
            }
        });
    }

    for (const name of ["call", "apply", "bind"] as const) {
        const original = Function.prototype[name];

        Object.defineProperty(Function.prototype, name, {
            configurable: false,
            enumerable: true,
            get: () => original,
            set: () => {
                throw createWriteError(`window.Function.prototype.${name})`);
            }
        });
    }
}

function restrictServiceWorkerRegistration(params: { serviceWorkersAllowedHostnames: string[] }) {
    const { serviceWorkersAllowedHostnames } = params;

    const { serviceWorker } = navigator;

    if (serviceWorker === undefined) {
        // NOTE: Non HTTPS context
        return;
    }

    const register_actual = serviceWorker.register.bind(serviceWorker);

    serviceWorker.register = function register(
        scriptURL: Parameters<ServiceWorkerContainer["register"]>[0],
        options?: Parameters<ServiceWorkerContainer["register"]>[1]
    ) {
        const url = `${typeof scriptURL === "string" ? scriptURL : scriptURL.href}`;

        const { hostname, protocol } = new URL(url, window.location.href);

        if (protocol === "blob:") {
            throw new Error(
                [
                    "oidc-spa: Blocked service worker registration from blob.",
                    "Only solution: Set enableTokenExfiltrationDefense to false",
                    "or load the worker script from a remote url."
                ].join(" ")
            );
        }

        if (
            !getIsHostnameAuthorized({
                allowedHostnames: serviceWorkersAllowedHostnames,
                extendAuthorizationToParentDomain: false,
                hostname
            })
        ) {
            throw new Error(
                [
                    `oidc-spa: Blocked service worker registration to ${hostname}.`,
                    `To authorize this registration add "${hostname}" to`,
                    "`serviceWorkersAllowedHostnames`."
                ].join(" ")
            );
        }

        return register_actual(url, options);
    };
}
