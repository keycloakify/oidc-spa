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
    | "Function";

export function freezeBrowserRuntime(params: { excludedApiNames: ApiName[] }) {
    const { excludedApiNames } = params;

    const createWriteError = (params: { target: string; apiName: ApiName }) => {
        const { target, apiName } = params;
        return new Error(
            [
                `oidc-spa: Blocked alteration of ${target}.`,
                `\nThis runtime is frozen to prevent monkey patching.`,
                `If it is monkey patched for legitimate reason add "${apiName}" to browserRuntimeFreeze.exclude.`,
                `\nDocs: https://docs.oidc-spa.dev/v/v8/resources/blocked-monkey-patching`
            ].join(" ")
        );
    };

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
        "btoa",
        "crypto.subtle",
        "Function"
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
            }

            {
                const subtlePd = Object.getOwnPropertyDescriptor(crypto, "subtle");
                if (subtlePd !== undefined && !subtlePd.configurable) {
                    continue;
                }
            }

            Object.defineProperty(crypto, "subtle", {
                configurable: false,
                enumerable: true,
                get: () => subtle,
                set: () => {
                    throw createWriteError({ target: "window.crypto.subtle", apiName });
                }
            });

            continue;
        }

        service_worker: {
            if (apiName !== "ServiceWorker") {
                break service_worker;
            }

            const name_ = "serviceWorker";

            const original = navigator[name_];

            Object.defineProperty(navigator, apiName, {
                configurable: false,
                enumerable: true,
                get: () => original,
                set: () => {
                    throw createWriteError({ target: `window.navigator.${name_}`, apiName });
                }
            });

            // NOTE: Not having `continue;` is not an oversight
        }

        Function: {
            if (apiName !== "Function") {
                break Function;
            }

            for (const name of ["call", "apply", "bind"] as const) {
                const original = Function.prototype[name];

                Object.defineProperty(Function.prototype, name, {
                    configurable: false,
                    enumerable: true,
                    get: () => original,
                    set: () => {
                        throw createWriteError({
                            target: `window.Function.prototype.${name})`,
                            apiName
                        });
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

                const target = `window.${apiName}.prototype.${propertyName}`;

                Object.defineProperty(original.prototype, propertyName, {
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
            }

            for (const symbol of Object.getOwnPropertySymbols(original.prototype)) {
                const pd = Object.getOwnPropertyDescriptor(original.prototype, symbol);

                assert(pd !== undefined);

                if (!pd.configurable) {
                    continue;
                }

                const target = `window.${apiName}.prototype[Symbol.${symbol.toString()}]`;

                Object.defineProperty(original.prototype, symbol, {
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
            }

            for (const propertyName of Object.getOwnPropertyNames(original)) {
                const pd = Object.getOwnPropertyDescriptor(original, propertyName);

                assert(pd !== undefined);

                if (!pd.configurable) {
                    continue;
                }

                const target = `window.${apiName}.${propertyName}`;

                Object.defineProperty(original, propertyName, {
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

                    const target = `new ${apiName}()[Symbol.iterator]().__proto__.${propertyName}`;

                    Object.defineProperty(iterator_prototype, propertyName, {
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
                }
            }
        }

        Object.defineProperty(window, apiName, {
            configurable: false,
            enumerable: true,
            get: () => original,
            set: () => {
                throw createWriteError({ target: `window.${apiName}`, apiName });
            }
        });
    }
}
