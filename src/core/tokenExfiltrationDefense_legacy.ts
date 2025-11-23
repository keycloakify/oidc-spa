import { assert } from "../tools/tsafe/assert";

export type Params = {
    freezeFetch?: boolean;
    freezeXMLHttpRequest?: boolean;
    freezeWebSocket?: boolean;
    freezePromise?: boolean;
    safeMode?: boolean;
};

export function handleTokenExfiltrationDefense_legacy(params: Params) {
    const {
        freezeFetch,
        freezeXMLHttpRequest,
        freezeWebSocket,
        freezePromise,
        safeMode = false
    } = params;

    const createWriteError = (target: string) =>
        new Error(
            [
                `oidc-spa: Monkey patching of ${target} has been blocked for security reasons.`,
                "You can disable this restriction by setting `safeMode: false` in `oidcEarlyInit()`",
                "or in your Vite plugin configuration,",
                "but please note this will reduce security.",
                "If you believe this restriction is too strict, please open an issue at:",
                "https://github.com/keycloakify/oidc-spa",
                "We're still identifying real-world blockers and can safely add exceptions where needed.",
                "For now, we prefer to err on the side of hardening rather than exposure."
            ].join(" ")
        );

    for (const name of [
        "fetch",
        "XMLHttpRequest",
        "WebSocket",
        "Headers",
        "URLSearchParams",
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
        const doSkip = (() => {
            switch (name) {
                case "XMLHttpRequest":
                    if (freezeXMLHttpRequest !== undefined) {
                        return !freezeXMLHttpRequest;
                    }
                    break;
                case "fetch":
                    if (freezeFetch !== undefined) {
                        return !freezeFetch;
                    }
                    break;
                case "WebSocket":
                    if (freezeWebSocket !== undefined) {
                        return !freezeWebSocket;
                    }
                    break;
                case "Promise":
                    if (freezePromise !== undefined) {
                        return !freezePromise;
                    }
                    break;
            }

            return !safeMode;
        })();

        if (doSkip) {
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

                Object.defineProperty(original.prototype, propertyName, {
                    enumerable: pd.enumerable,
                    configurable: false,
                    ...("value" in pd
                        ? {
                              get: () => pd.value,
                              set: () => {
                                  throw createWriteError(`window.${name}.prototype.${propertyName}`);
                              }
                          }
                        : {
                              get: pd.get,
                              set:
                                  pd.set ??
                                  (() => {
                                      throw createWriteError(`window.${name}.prototype.${propertyName}`);
                                  })
                          })
                });
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

    if (safeMode) {
        for (const name of ["call", "apply", "bind"] as const) {
            const original = Function.prototype[name];

            Object.defineProperty(Function.prototype, name, {
                configurable: false,
                enumerable: true,
                get: () => original,
                set: () => {
                    throw createWriteError(`window.Function.prototype.${name});`);
                }
            });
        }
    }
}
