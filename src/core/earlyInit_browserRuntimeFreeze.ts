import { assert, type Equals } from "../tools/tsafe/assert";

export type ApiName =
    | "fetch"
    | "XMLHttpRequest"
    | "WebSocket"
    | "Headers"
    | "URLSearchParams"
    | "EventSource"
    | "ServiceWorkerContainer"
    | "ServiceWorkerRegistration"
    | "ServiceWorker"
    | "FormData"
    | "URL"
    | "Request"
    | "WeakMap"
    | "Blob"
    | "String"
    | "Object"
    | "Promise"
    | "Array"
    | "RegExp"
    | "TextEncoder"
    | "Uint8Array"
    | "Uint32Array"
    | "Response"
    | "Reflect"
    | "JSON"
    | "encodeURIComponent"
    | "decodeURIComponent"
    | "atob"
    | "btoa"
    | "crypto.subtle"
    | "Function.prototype.call";

export function browserRuntimeFreeze(params?: { excludes?: ApiName[] }) {
    const { excludes: excludedApiNames = [] } = params ?? {};

    const enableBrowserRuntimeFreeze = () => {
        freezeBrowserRuntime({ excludedApiNames });
    };

    return { enableBrowserRuntimeFreeze };
}

function freezeBrowserRuntime(params: { excludedApiNames: ApiName[] }) {
    const { excludedApiNames } = params;

    const createWriteError = (params: { target: string; apiName: ApiName }) => {
        const { target, apiName } = params;
        return new Error(
            [
                `oidc-spa: Blocked alteration of ${target}.`,
                `\nThis runtime is frozen to prevent monkey patching.`,
                `If it is monkey patched for legitimate reason add "${apiName}" to browserRuntimeFreeze.excludes.`,
                `\nDocs: https://docs.oidc-spa.dev/v/v10/security-features/browser-runtime-freeze`
            ].join(" ")
        );
    };

    const definePropertyInterceptors: ((o: unknown, p: PropertyKey) => void | never)[] = [];

    {
        const defineProperty_original = Object.defineProperty;

        Object.defineProperty = (o, p, attributes) => {
            definePropertyInterceptors.forEach(definePropertyInterceptor => {
                definePropertyInterceptor(o, p);
            });

            return defineProperty_original(o, p, attributes);
        };
    }

    for (const apiName of [
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
        "btoa",
        "crypto.subtle",
        "Function.prototype.call",
        "Object"
    ] as const) {
        assert<Equals<typeof apiName, ApiName>>;

        if (excludedApiNames.includes(apiName)) {
            continue;
        }

        crypto_subtle: {
            if (apiName !== "crypto.subtle") {
                break crypto_subtle;
            }

            const { crypto } = window;

            if (!crypto?.subtle) {
                continue;
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
                                  throw createWriteError({ target, apiName });
                              }
                          }
                        : {
                              get: pd.get,
                              set:
                                  pd.set ??
                                  (() => {
                                      throw createWriteError({ target, apiName });
                                  })
                          })
                });

                definePropertyInterceptors.push((o, p) => {
                    if (o === prototype && p === propertyName) {
                        throw createWriteError({ target, apiName });
                    }
                });
            }

            {
                const subtlePd = Object.getOwnPropertyDescriptor(crypto, "subtle");
                if (subtlePd !== undefined && !subtlePd.configurable) {
                    continue;
                }
            }

            {
                const o = crypto;
                const p = "subtle";
                const createWriteError_local = () =>
                    createWriteError({ target: "window.crypto.subtle", apiName });

                Object.defineProperty(o, p, {
                    configurable: false,
                    enumerable: true,
                    get: () => subtle,
                    set: () => {
                        throw createWriteError_local();
                    }
                });

                definePropertyInterceptors.push((o_, p_) => {
                    if (o_ === o && p_ === p) {
                        throw createWriteError_local();
                    }
                });
            }

            continue;
        }

        service_worker: {
            if (apiName !== "ServiceWorker") {
                break service_worker;
            }

            const o = window.navigator;
            const p = "serviceWorker";

            const original = o?.[p];

            if (!original) {
                break service_worker;
            }

            const createWriteError_local = () =>
                createWriteError({ target: `window.navigator.${p}`, apiName });

            Object.defineProperty(o, p, {
                configurable: false,
                enumerable: true,
                get: () => original,
                set: () => {
                    throw createWriteError_local();
                }
            });

            definePropertyInterceptors.push((o_, p_) => {
                if (o_ === o && p_ === p) {
                    throw createWriteError_local();
                }
            });

            // NOTE: Not having `continue;` is not an oversight
        }

        Function: {
            if (apiName !== "Function.prototype.call") {
                break Function;
            }

            const pName = "call";

            {
                definePropertyInterceptors.push((o, p) => {
                    if (typeof o === "function" && o !== Function.prototype && p === pName) {
                        throw createWriteError({
                            target: `<some function> 's .${pName}() behavior`,
                            apiName
                        });
                    }
                });
            }

            Object.defineProperties = (o, properties) => {
                for (const p of Reflect.ownKeys(properties)) {
                    Object.defineProperty(o, p, properties[p as keyof typeof properties]);
                }
                return o;
            };

            {
                const original = Function.prototype[pName];

                const o = Function.prototype;
                const p = pName;

                const createWriteError_local = () =>
                    createWriteError({
                        target: `window.Function.prototype.${p}`,
                        apiName
                    });

                Object.defineProperty(o, p, {
                    configurable: false,
                    enumerable: true,
                    get: () => original,
                    set: () => {
                        throw createWriteError_local();
                    }
                });

                definePropertyInterceptors.push((o_, p_) => {
                    if (o === o_ && p === p_) {
                        throw createWriteError_local();
                    }
                });
            }

            continue;
        }

        const original = window[apiName];

        if (!original) {
            continue;
        }

        if ("prototype" in original) {
            for (const propertyName of Object.getOwnPropertyNames(original.prototype)) {
                if (apiName === "Object") {
                    if (
                        propertyName === "toString" ||
                        propertyName === "constructor" ||
                        propertyName === "valueOf"
                    ) {
                        continue;
                    }
                }

                if (apiName === "Array") {
                    if (propertyName === "constructor" || propertyName === "concat") {
                        continue;
                    }
                }

                const pd = Object.getOwnPropertyDescriptor(original.prototype, propertyName);

                assert(pd !== undefined);

                if (!pd.configurable) {
                    continue;
                }

                const o = original.prototype;
                const p = propertyName;

                const createWriteError_local = () =>
                    createWriteError({ target: `window.${apiName}.prototype.${p}`, apiName });

                Object.defineProperty(o, p, {
                    enumerable: pd.enumerable,
                    configurable: false,
                    ...("value" in pd
                        ? {
                              get: () => pd.value,
                              set: () => {
                                  throw createWriteError_local();
                              }
                          }
                        : {
                              get: pd.get,
                              set:
                                  pd.set ??
                                  (() => {
                                      throw createWriteError_local();
                                  })
                          })
                });

                definePropertyInterceptors.push((o_, p_) => {
                    if (o_ === o && p_ === p) {
                        throw createWriteError_local();
                    }
                });
            }

            for (const symbol of Object.getOwnPropertySymbols(original.prototype)) {
                const pd = Object.getOwnPropertyDescriptor(original.prototype, symbol);

                assert(pd !== undefined);

                if (!pd.configurable) {
                    continue;
                }

                const o = original.prototype;
                const p = symbol;

                const createWriteError_local = () =>
                    createWriteError({
                        target: `window.${apiName}.prototype[Symbol.${p.toString()}]`,
                        apiName
                    });

                Object.defineProperty(o, p, {
                    enumerable: pd.enumerable,
                    configurable: false,
                    ...("value" in pd
                        ? {
                              get: () => pd.value,
                              set: () => {
                                  throw createWriteError_local();
                              }
                          }
                        : {
                              get: pd.get,
                              set:
                                  pd.set ??
                                  (() => {
                                      throw createWriteError_local();
                                  })
                          })
                });

                definePropertyInterceptors.push((o_, p_) => {
                    if (o_ === o && p_ === p) {
                        throw createWriteError_local();
                    }
                });
            }

            for (const propertyName of Object.getOwnPropertyNames(original)) {
                const pd = Object.getOwnPropertyDescriptor(original, propertyName);

                assert(pd !== undefined);

                if (!pd.configurable) {
                    continue;
                }

                const o = original;
                const p = propertyName;

                const createWriteError_local = () =>
                    createWriteError({ target: `window.${apiName}.${propertyName}`, apiName });

                Object.defineProperty(o, p, {
                    enumerable: pd.enumerable,
                    configurable: false,
                    ...("value" in pd
                        ? {
                              get: () => pd.value,
                              set: () => {
                                  throw createWriteError_local();
                              }
                          }
                        : {
                              get: pd.get,
                              set:
                                  pd.set ??
                                  (() => {
                                      throw createWriteError_local();
                                  })
                          })
                });

                definePropertyInterceptors.push((o_, p_) => {
                    if (o_ === o && p_ === p) {
                        throw createWriteError_local();
                    }
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

                    const o = iterator_prototype;
                    const p = propertyName;

                    const createWriteError_local = () =>
                        createWriteError({
                            target: `new ${apiName}()[Symbol.iterator]().__proto__.${propertyName}`,
                            apiName
                        });

                    Object.defineProperty(o, p, {
                        enumerable: pd.enumerable,
                        configurable: false,
                        ...("value" in pd
                            ? {
                                  get: () => pd.value,
                                  set: () => {
                                      throw createWriteError_local();
                                  }
                              }
                            : {
                                  get: pd.get,
                                  set:
                                      pd.set ??
                                      (() => {
                                          throw createWriteError_local();
                                      })
                              })
                    });

                    definePropertyInterceptors.push((o_, p_) => {
                        if (o_ === o && p_ === p) {
                            throw createWriteError_local();
                        }
                    });
                }
            }
        }

        {
            const o = window;
            const p = apiName;

            const createWriteError_local = () =>
                createWriteError({ target: `window.${apiName}`, apiName });

            Object.defineProperty(o, p, {
                configurable: false,
                enumerable: true,
                get: () => original,
                set: () => {
                    throw createWriteError_local();
                }
            });

            definePropertyInterceptors.push((o_, p_) => {
                if (o_ === o && p_ === p) {
                    throw createWriteError_local();
                }
            });
        }
    }
}
