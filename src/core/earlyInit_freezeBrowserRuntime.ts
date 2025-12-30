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
        "btoa",
        "crypto.subtle",
        "Function"
    ] as const) {
        assert<Equals<typeof name, ApiName>>;

        if (excludedApiNames.includes(name)) {
            continue;
        }

        crypto_subtle: {
            if (name !== "crypto.subtle") {
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
                    continue;
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

            continue;
        }

        service_worker: {
            if (name !== "ServiceWorker") {
                break service_worker;
            }

            const name_ = "serviceWorker";

            const original = navigator[name_];

            Object.defineProperty(navigator, name, {
                configurable: false,
                enumerable: true,
                get: () => original,
                set: () => {
                    throw createWriteError(`window.navigator.${name_}`);
                }
            });

            // NOTE: Not having `continue;` is not an oversight
        }

        Function: {
            if (name !== "Function") {
                break Function;
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

            continue;
        }

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
}
