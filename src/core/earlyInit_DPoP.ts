import { assert } from "../tools/tsafe/assert";
import { generateES256DPoPProof } from "../tools/generateES256DPoPProof";
import { createGetServerDateNow, type ParamsOfCreateGetServerDateNow } from "../tools/getServerDateNow";
import { prModuleCreateOidc } from "./earlyInit_prModuleCreateOidc";

type DPoPState = import("./createOidc").Exports_DPoP.DPoPState;

type DPoPStore = {
    get: () => Promise<DPoPState | undefined>;
    set: (dpopState: DPoPState) => Promise<void>;
    flush: () => Promise<void>;
};

// NOTE: Using object instead of Map because Map is not freezed.
const dpopStoreByClientId: { [configId: string]: DPoPStore | undefined } = {};

function createAndRecordDPoPStore(params: { configId: string }): DPoPStore {
    const { configId } = params;

    const STORE_NAME = "main";

    const prDb = new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(`oidc-spa:DPoP:${configId}`, 1);

        request.onsuccess = () => {
            resolve(request.result);
        };
        request.onerror = () => {
            reject(request.error);
        };
    });

    const runTransaction = async <T>(
        mode: IDBTransactionMode,
        action: (store: IDBObjectStore) => IDBRequest<T>
    ): Promise<T> => {
        const db = await prDb;

        return await new Promise<T>((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, mode);
            const store = tx.objectStore(STORE_NAME);
            const request = action(store);

            request.onsuccess = () => resolve(request.result as T);
            request.onerror = () => reject(request.error);
            tx.onabort = () => reject(tx.error);
        });
    };

    const KEY = "dpopState";

    const dpopStore: DPoPStore = {
        get: async () =>
            await runTransaction<DPoPState | undefined>("readonly", store => store.get(KEY)),
        set: async dpopState_new => {
            await runTransaction("readwrite", store => store.put(dpopState_new, KEY));
        },
        flush: async () => {
            await runTransaction("readwrite", store => store.delete(KEY));
        }
    };

    assert(!(configId in dpopStoreByClientId), "30439");

    dpopStoreByClientId[configId] = dpopStore;

    return dpopStore;
}

/*
(async () => {
    const s = createAndRecordDPoPStore({ configId: "foo" });

    const v = await s.get();

    console.log({ v });

    await s.flush();
    await s.flush();

    console.log("PASS");

})();
*/

async function getDpopState_assertPresent(params: { configId: string }): Promise<DPoPState> {
    const { configId } = params;

    const dpopStore = dpopStoreByClientId[configId];

    assert(dpopStore !== undefined, "39434");

    const dpopState = await dpopStore.get();

    assert(dpopState, "4933");

    return dpopState;
}

/**
 * NOTE: This is a heavily hacked implementation of the interface oidc-client-ts expect as DPoP store.
 * We've forked and own oidc-client-ts, we can make assertion on it's usage.
 * We can make assertion on how this will be used.
 */
const exports_createDPoPStore: import("./createOidc").Exports_DPoP["createDPoPStore"] = ({
    configId,
    clientId
}) => {
    const dpopStore = createAndRecordDPoPStore({ configId });

    function addToJSONPropertyToKeys(dpopState: DPoPState): void {
        if (Object.getOwnPropertyNames(dpopState.keys).includes("toJSON")) {
            return;
        }
        Object.defineProperty(dpopState.keys, "toJSON", {
            enumerable: false,
            value: () => ({
                __brand: "CryptoKeyPair Alias",
                configId
            })
        });
    }

    return {
        set: async (_key, value) => {
            addToJSONPropertyToKeys(value);
            await dpopStore.set(value);
        },
        get: async () => {
            const dpopState = await dpopStore.get();

            assert(dpopState !== undefined, "4806");

            addToJSONPropertyToKeys(dpopState);

            return dpopState;
        },
        remove: async () => {
            const dpopState = await dpopStore.get();

            assert(dpopState !== undefined, "4806");

            await dpopStore.flush();

            addToJSONPropertyToKeys(dpopState);

            return dpopState;
        },
        getAllKeys: async () => {
            if ((await dpopStore.get()) === undefined) {
                return [];
            } else {
                return [clientId];
            }
        }
    };
};

const accessTokenConfigIdEntries: {
    configId: string;
    accessToken: string;
    paramsOfCreateGetServerDateNow: ParamsOfCreateGetServerDateNow;
}[] = [];

function registerAccessTokenForDPoP(params: {
    configId: string;
    accessToken: string;
    paramsOfCreateGetServerDateNow: ParamsOfCreateGetServerDateNow;
}) {
    const { configId, accessToken, paramsOfCreateGetServerDateNow } = params;

    for (const entry of accessTokenConfigIdEntries) {
        if (entry.configId !== configId) {
            continue;
        }

        setTimeout(() => {
            const index = accessTokenConfigIdEntries.indexOf(entry);

            if (index === -1) {
                return;
            }

            accessTokenConfigIdEntries.splice(index, 1);
        }, 30_000);
    }

    const entry_new: (typeof accessTokenConfigIdEntries)[number] = {
        configId,
        accessToken,
        paramsOfCreateGetServerDateNow
    };

    accessTokenConfigIdEntries.push(entry_new);
}

const nonceEntriesByConfigId: { [configId: string]: { origin: string; nonce: string }[] | undefined } =
    {};

function generateMaterialToUpgradeBearerRequestToDPoP(params: {
    httpMethod: string;
    url: string;
    authorizationHeaderValue: string | undefined;
}):
    | {
          isHandled: false;
      }
    | {
          isHandled: true;
          accessToken: string;
          nextStepDPoP: () => Promise<{
              dpopProof: string;
              registerDPoPNonce: (params: { nonce: string }) => void;
              reGenerateDpopProof: () => Promise<string>;
          }>;
      } {
    const { httpMethod, url, authorizationHeaderValue } = params;

    if (authorizationHeaderValue === undefined) {
        return {
            isHandled: false
        };
    }

    const accessToken = (() => {
        const match = authorizationHeaderValue.match(/^\s*Bearer\s+(.+?)\s*$/i);

        if (match === null) {
            return undefined;
        }

        return match[1];
    })();

    if (accessToken === undefined) {
        return {
            isHandled: false
        };
    }

    const entry = accessTokenConfigIdEntries.find(entry => entry.accessToken === accessToken);

    if (entry === undefined) {
        return {
            isHandled: false
        };
    }

    const { configId, paramsOfCreateGetServerDateNow } = entry;

    const prKeyPair = (async () => {
        const dpopState = await getDpopState_assertPresent({ configId });

        assert(dpopState !== undefined, "304922047");

        return dpopState.keys;
    })();

    const nonceEntries = (nonceEntriesByConfigId[configId] ??= []);

    const origin = new URL(url).origin;

    const generateDPoPProof = async () =>
        generateES256DPoPProof({
            keyPair: await prKeyPair,
            url,
            accessToken,
            httpMethod,
            nonce: nonceEntries.find(entry => entry.origin === origin)?.nonce,
            getServerDateNow: createGetServerDateNow(paramsOfCreateGetServerDateNow)
        });

    return {
        isHandled: true,
        accessToken,
        nextStepDPoP: async () => ({
            dpopProof: await generateDPoPProof(),
            registerDPoPNonce: ({ nonce }) => {
                const nonceEntry = nonceEntries.find(entry => entry.origin === origin);

                if (nonceEntry !== undefined) {
                    nonceEntry.nonce = nonce;
                } else {
                    nonceEntries.push({ origin, nonce });
                }
            },
            reGenerateDpopProof: generateDPoPProof
        })
    };
}

function registerInterceptors() {
    function readNonceFromResponseHeader(params: {
        getResponseHeader: (headerName: string) => string | null;
    }) {
        const { getResponseHeader } = params;

        dpop_nonce_header: {
            const value = getResponseHeader("DPoP-Nonce");
            if (value === null) {
                break dpop_nonce_header;
            }
            return value;
        }

        www_authenticate_header: {
            const value = getResponseHeader("WWW-Authenticate");

            if (value === null) {
                break www_authenticate_header;
            }

            {
                const value_lower = value.toLowerCase();

                if (!value_lower.includes("dpop") || !value_lower.includes("use_dpop_nonce")) {
                    break www_authenticate_header;
                }
            }

            const match = value.match(/nonce="([^"]+)"/i);

            if (match === null) {
                break www_authenticate_header;
            }

            return match[1];
        }

        return undefined;
    }

    {
        const createFetchProxy = (params: { fetch: typeof window.fetch; isFetchLater: boolean }) => {
            const { fetch, isFetchLater } = params;

            let hasLoggedFetchLaterWarning = false;

            const fetchProxy: typeof fetch = async (input, init) => {
                if (accessTokenConfigIdEntries.length === 0) {
                    return fetch(input, init);
                }

                let request = input instanceof Request ? input : new Request(input, init);

                const fetch_ctx: (request: Request) => Promise<Response> = (() => {
                    if (!init) {
                        return fetch;
                    }

                    // @ts-expect-error
                    const { activateAfter } = init;

                    if (!activateAfter) {
                        return fetch;
                    }

                    return request => {
                        // @ts-expect-error
                        return fetch(request, { activateAfter });
                    };
                })();

                let dpopStatus:
                    | { isHandled: false }
                    | {
                          isHandled: true;
                          registerDPoPNonce: (params: { nonce: string }) => void;
                          reGenerateDpopProof: () => Promise<string>;
                      };

                update_headers: {
                    const result = generateMaterialToUpgradeBearerRequestToDPoP({
                        authorizationHeaderValue: request.headers.get("Authorization") ?? undefined,
                        url: request.url,
                        httpMethod: request.method
                    });

                    if (!result.isHandled) {
                        dpopStatus = { isHandled: false };
                        break update_headers;
                    }

                    const { accessToken, nextStepDPoP } = result;

                    const { dpopProof, reGenerateDpopProof, registerDPoPNonce } = await nextStepDPoP();

                    request = new Request(request, {
                        headers: (() => {
                            const h = new Headers(request.headers);
                            h.set("Authorization", `DPoP ${accessToken}`);
                            h.set("DPoP", dpopProof);
                            return h;
                        })()
                    });

                    dpopStatus = {
                        isHandled: true,
                        registerDPoPNonce,
                        reGenerateDpopProof
                    };
                }

                if (!dpopStatus.isHandled) {
                    return fetch_ctx(request);
                }

                if (isFetchLater && !hasLoggedFetchLaterWarning) {
                    console.warn(
                        [
                            "oidc-spa: Detected an authenticated fetchLater() request while DPoP is enabled.",
                            "Support for fetchLater + DPoP is not fully implemented yet.",
                            "If you rely on this, please open an issue and we will implement support:",
                            "https://github.com/keycloakify/oidc-spa"
                        ].join(" ")
                    );
                    hasLoggedFetchLaterWarning = true;
                }

                let request_cloneForReplay = (() => {
                    const method = request.method.toUpperCase();

                    if (method !== "GET" && method !== "HEAD") {
                        return undefined;
                    }

                    try {
                        return request.clone();
                    } catch {
                        return undefined;
                    }
                })();

                let response = await fetch_ctx(request);

                // NOTE: We avoid headers.get to dodge CORS warnings
                const getResponseHeader = (headerName: string) => {
                    const headerName_normalized = headerName.toLowerCase();
                    for (const [headerName_i, value] of response.headers) {
                        if (headerName_i.toLowerCase() !== headerName_normalized) {
                            continue;
                        }
                        return value;
                    }
                    return null;
                };

                re_send_with_DPoP_nonce: {
                    if (response.status !== 401) {
                        break re_send_with_DPoP_nonce;
                    }

                    const nonce = readNonceFromResponseHeader({ getResponseHeader });

                    if (nonce === undefined) {
                        break re_send_with_DPoP_nonce;
                    }

                    dpopStatus.registerDPoPNonce({ nonce });

                    if (request_cloneForReplay === undefined) {
                        break re_send_with_DPoP_nonce;
                    }

                    const dpopProof_new = await dpopStatus.reGenerateDpopProof();

                    response = await fetch_ctx(
                        new Request(request_cloneForReplay, {
                            headers: (() => {
                                const h = new Headers(request_cloneForReplay.headers);
                                h.set("DPoP", dpopProof_new);
                                return h;
                            })()
                        })
                    );
                }

                {
                    const nonce = readNonceFromResponseHeader({ getResponseHeader });

                    if (nonce !== undefined) {
                        dpopStatus.registerDPoPNonce({ nonce });
                    }
                }

                return response;
            };

            return fetchProxy;
        };

        window.fetch = createFetchProxy({ fetch: window.fetch, isFetchLater: false });

        // @ts-expect-error
        if (window.fetchLater) {
            // @ts-expect-error
            window.fetchLater = createFetchProxy({ fetch: window.fetchLater, isFetchLater: true });
        }
    }

    // NOTE: Intercept internal DPoP signed auth request made internally by
    // our fork of oidc-client-ts.
    {
        const fetch_before = window.fetch;

        window.fetch = async (input, init) => {
            handle: {
                if (init === undefined) {
                    break handle;
                }

                if (init.headers === undefined) {
                    break handle;
                }

                if (init.headers instanceof Array) {
                    break handle;
                }

                let dpopHeaderValue: string | undefined = undefined;

                if (init.headers instanceof Headers) {
                    dpopHeaderValue = init.headers.get("DPoP") ?? undefined;
                } else {
                    try {
                        dpopHeaderValue = init.headers["DPoP"];
                    } catch {}
                }

                if (typeof dpopHeaderValue !== "string") {
                    break handle;
                }

                const match = dpopHeaderValue.match(/^generateDPoPProof\((.+)\)$/);

                if (match === null) {
                    break handle;
                }

                const {
                    url,
                    accessToken,
                    httpMethod,
                    keyPair: { configId },
                    nonce
                } = JSON.parse(match[1]) as {
                    url: string;
                    accessToken?: string;
                    httpMethod?: string;
                    keyPair: {
                        __brand: "CryptoKeyPair Alias";
                        configId: string;
                    };
                    nonce?: string;
                };

                const dpopState = await getDpopState_assertPresent({ configId });

                const { paramsOfCreateGetServerDateNow } =
                    accessTokenConfigIdEntries
                        .filter(entry => entry.configId === configId)
                        .reverse()
                        .find(() => true) ?? {};

                const dpopProof = await generateES256DPoPProof({
                    keyPair: dpopState.keys,
                    url,
                    accessToken,
                    httpMethod,
                    nonce,
                    getServerDateNow:
                        paramsOfCreateGetServerDateNow === undefined
                            ? () => Date.now()
                            : createGetServerDateNow(paramsOfCreateGetServerDateNow)
                });

                if (init.headers instanceof Headers) {
                    init.headers.set("DPoP", dpopProof);
                } else {
                    init.headers["DPoP"] = dpopProof;
                }
            }

            return fetch_before(input, init);
        };
    }

    {
        const XMLHttpRequest_prototype_actual = {
            open: XMLHttpRequest.prototype.open,
            send: XMLHttpRequest.prototype.send,
            setRequestHeader: XMLHttpRequest.prototype.setRequestHeader
        };

        const stateByInstance = new WeakMap<
            XMLHttpRequest,
            {
                method: string;
                url: string;
                isSynchronous: boolean;
                handledRequestState:
                    | {
                          accessToken: string;
                          nextStepDPoP: () => Promise<{
                              dpopProof: string;
                              registerDPoPNonce: (params: { nonce: string }) => void;
                              reGenerateDpopProof: () => Promise<string>;
                          }>;
                          hasSendBeenCalled: boolean;
                      }
                    | undefined;
            }
        >();

        XMLHttpRequest.prototype.open = function () {
            const [method, url, async] = arguments as any as [string, string | URL, boolean | undefined];

            if (stateByInstance.get(this)?.handledRequestState !== undefined) {
                throw new Error(
                    [
                        "oidc-spa: Cannot reuse XMLHttpRequest instances",
                        "that have been DPoP upgraded"
                    ].join(" ")
                );
            }

            stateByInstance.set(this, {
                method: method.toUpperCase(),
                url: typeof url === "string" ? new URL(url, window.location.href).href : url.href,
                isSynchronous: async === false,
                handledRequestState: undefined
            });

            return XMLHttpRequest_prototype_actual.open.call(
                this,
                // @ts-expect-error
                ...arguments
            );
        };

        XMLHttpRequest.prototype.setRequestHeader = function (name, value) {
            intercept: {
                const state = stateByInstance.get(this);

                if (state?.handledRequestState?.hasSendBeenCalled === true) {
                    throw new DOMException(
                        "Failed to execute 'setRequestHeader' on 'XMLHttpRequest': The object's state must be OPENED.",
                        "InvalidStateError"
                    );
                }

                if (name.toLowerCase() !== "authorization") {
                    break intercept;
                }

                if (this.readyState !== XMLHttpRequest.OPENED) {
                    break intercept;
                }

                // NOTE: If it's opened we know open have been called and hence the state is set.
                assert(state !== undefined, "34308330");

                const result = generateMaterialToUpgradeBearerRequestToDPoP({
                    httpMethod: state.method,
                    url: state.url,
                    authorizationHeaderValue: value
                });

                if (!result.isHandled) {
                    break intercept;
                }

                if (state.handledRequestState !== undefined) {
                    throw new Error(
                        [
                            'oidc-spa: Calling xhr.setRequestHeader("Authorization", `Bearer <access_token>`)',
                            "more than once on the same instance, this is probably an usage error"
                        ].join(" ")
                    );
                }

                if (state.isSynchronous) {
                    throw new Error(
                        [
                            "oidc-spa: Cannot perform synchronous authenticated XMLHttpRequest",
                            "requests when DPoP is enabled."
                        ].join(" ")
                    );
                }

                state.handledRequestState = {
                    accessToken: result.accessToken,
                    nextStepDPoP: result.nextStepDPoP,
                    hasSendBeenCalled: false
                };

                return;
            }

            return XMLHttpRequest_prototype_actual.setRequestHeader.call(
                this,
                // @ts-expect-error
                ...arguments
            );
        };

        XMLHttpRequest.prototype.send = function () {
            intercept: {
                const state = stateByInstance.get(this);

                if (state === undefined) {
                    break intercept;
                }

                const { handledRequestState } = state;

                if (handledRequestState === undefined) {
                    break intercept;
                }

                if (handledRequestState.hasSendBeenCalled) {
                    throw new DOMException(
                        "Failed to execute 'send' on 'XMLHttpRequest': The object's state must be OPENED.",
                        "InvalidStateError"
                    );
                }

                handledRequestState.hasSendBeenCalled = true;

                const { accessToken, nextStepDPoP } = handledRequestState;

                nextStepDPoP().then(({ dpopProof, registerDPoPNonce }) => {
                    if (this.readyState !== XMLHttpRequest.OPENED) {
                        // abort() has been called.
                        return;
                    }

                    const onReadyStateChange = () => {
                        if (this.readyState !== XMLHttpRequest.DONE) {
                            return;
                        }

                        const nonce = readNonceFromResponseHeader({
                            // NOTE: We avoid this.getResponseHeader(headerName) to dodge CORS warnings
                            getResponseHeader: headerName => {
                                const headers = this.getAllResponseHeaders();

                                if (!headers) {
                                    return null;
                                }

                                const targetHeaderName = headerName.toLowerCase();

                                for (const line of headers.split(/\r?\n/)) {
                                    const idx = line.indexOf(":");

                                    if (idx === -1) {
                                        continue;
                                    }

                                    const name = line.slice(0, idx).trim().toLowerCase();

                                    if (name !== targetHeaderName) {
                                        continue;
                                    }

                                    return line.slice(idx + 1).trim();
                                }

                                return null;
                            }
                        });

                        if (nonce !== undefined) {
                            registerDPoPNonce({ nonce });
                        }

                        this.removeEventListener("readystatechange", onReadyStateChange);
                    };

                    this.addEventListener("readystatechange", onReadyStateChange);

                    XMLHttpRequest_prototype_actual.setRequestHeader.call(
                        this,
                        "Authorization",
                        `DPoP ${accessToken}`
                    );
                    XMLHttpRequest_prototype_actual.setRequestHeader.call(this, "DPoP", dpopProof);

                    XMLHttpRequest_prototype_actual.send.call(this, ...arguments);
                });

                return;
            }

            return XMLHttpRequest_prototype_actual.send.call(this, ...arguments);
        };
    }
}

export function DPoP(params: { mode: "auto" | "enforced" }) {
    const { mode } = params;

    const enableDPoP = () => {
        registerInterceptors();
        prModuleCreateOidc.then(({ registerExports_DPoP }) => {
            registerExports_DPoP({
                isEnforced: mode === "enforced",
                createDPoPStore: exports_createDPoPStore,
                registerAccessTokenForDPoP
            });
        });
    };

    return { enableDPoP };
}
