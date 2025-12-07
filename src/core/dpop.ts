import { assert } from "../tools/tsafe/assert";
import { generateES256DPoPProof } from "../tools/generateES256DPoPProof";

export type DPoPStore = {
    set: (key: string, value: DPoPState) => Promise<void>;
    get: (key: string) => Promise<DPoPState>;
    remove: (key: string) => Promise<DPoPState>;
    getAllKeys: () => Promise<string[]>;
};

export type DPoPState = {
    keys: CryptoKeyPair;
    nonce?: string;
};

// NOTE: Using object instead of Map because Map is not freezed.
const dpopStateByConfigId: Record<string, DPoPState | undefined> = {};

export function createInMemoryDPoPStore(params: { configId: string }): DPoPStore {
    const { configId } = params;

    let key_singleton: string | undefined = undefined;

    const store: DPoPStore = {
        set: (key, value) => {
            if (key_singleton !== undefined) {
                assert(key === key_singleton, "394303302");
            }

            key_singleton = key;

            dpopStateByConfigId[configId] = value;

            return Promise.resolve();
        },
        get: key => {
            assert(key_singleton !== undefined, "49303403");
            assert(key_singleton === key, "34023493");
            const value = dpopStateByConfigId[configId];
            assert(value !== undefined, "943023493");
            return Promise.resolve(value);
        },
        remove: async key => {
            const value = await store.get(key);
            delete dpopStateByConfigId[configId];
            return value;
        },
        getAllKeys: () => {
            if (configId in dpopStateByConfigId) {
                assert(key_singleton !== undefined, "39430338");
                return Promise.resolve([key_singleton]);
            } else {
                return Promise.resolve([]);
            }
        }
    };

    return store;
}

const accessTokenConfigIdEntries: {
    configId: string;
    accessToken: string;
    nonceEntries: { origin: string; nonce: string }[];
}[] = [];

export function registerAccessTokenForDPoP(params: { configId: string; accessToken: string }) {
    const { configId, accessToken } = params;

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
        nonceEntries: []
    };

    accessTokenConfigIdEntries.push(entry_new);
}

export function implementFetchAndXhrDPoPInterceptor() {
    {
        const createFetchProxy = (params: { fetch: typeof window.fetch }) => {
            const { fetch } = params;

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
                          registerNonce: (params: { nonce: string }) => void;
                          reGenerateDpopProof: () => Promise<string>;
                      };

                update_headers: {
                    const result = await generateMaterialToUpgradeBearerRequestToDPoP({
                        authorizationHeaderValue: request.headers.get("Authorization") ?? undefined,
                        url: request.url,
                        httpMethod: request.method
                    });

                    if (!result.isHandled) {
                        dpopStatus = { isHandled: false };
                        break update_headers;
                    }

                    request = new Request(request, {
                        headers: (() => {
                            const h = new Headers(request.headers);
                            h.set("Authorization", `DPoP ${result.accessToken}`);
                            h.set("DPoP", result.dpopProof);
                            return h;
                        })()
                    });

                    dpopStatus = {
                        isHandled: true,
                        registerNonce: result.registerNonce,
                        reGenerateDpopProof: result.reGenerateDpopProof
                    };
                }

                if (!dpopStatus.isHandled) {
                    return fetch_ctx(request);
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

                const readNonceFromResponseHeader = (params: { responseHeaders: Headers }) => {
                    const { responseHeaders } = params;

                    dpop_nonce_header: {
                        const value = responseHeaders.get("DPoP-Nonce");
                        if (value === null) {
                            break dpop_nonce_header;
                        }
                        return value;
                    }

                    www_authenticate_header: {
                        const value = responseHeaders.get("WWW-Authenticate");

                        if (value === null) {
                            break www_authenticate_header;
                        }

                        {
                            const value_lower = value.toLowerCase();

                            if (
                                !value_lower.includes("dpop") ||
                                !value_lower.includes("use_dpop_nonce")
                            ) {
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
                };

                re_send_with_DPoP_nonce: {
                    if (response.status !== 401) {
                        break re_send_with_DPoP_nonce;
                    }

                    const nonce = readNonceFromResponseHeader({
                        responseHeaders: response.headers
                    });

                    if (nonce === undefined) {
                        break re_send_with_DPoP_nonce;
                    }

                    dpopStatus.registerNonce({ nonce });

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
                    const nonce = readNonceFromResponseHeader({
                        responseHeaders: response.headers
                    });

                    if (nonce !== undefined) {
                        dpopStatus.registerNonce({ nonce });
                    }
                }

                return response;
            };

            return fetchProxy;
        };

        window.fetch = createFetchProxy({ fetch: window.fetch });

        // @ts-expect-error
        if (window.fetchLater) {
            // @ts-expect-error
            window.fetchLater = createFetchProxy({ fetch: window.fetchLater });
        }
    }
    {
        //TODO: Write a similar interceptor for XMLHttpRequest.
    }
}

async function generateMaterialToUpgradeBearerRequestToDPoP(params: {
    httpMethod: string;
    url: string;
    authorizationHeaderValue: string | undefined;
}): Promise<
    | {
          isHandled: false;
      }
    | {
          isHandled: true;
          accessToken: string;
          dpopProof: string;
          registerNonce: (params: { nonce: string }) => void;
          reGenerateDpopProof: () => Promise<string>;
      }
> {
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

    const { configId, nonceEntries } = entry;

    const dpopState = dpopStateByConfigId[configId];

    assert(dpopState !== undefined, "304922047");

    const origin = new URL(url).origin;

    const nonce = nonceEntries.find(entry => entry.origin === origin)?.nonce;

    return {
        isHandled: true,
        accessToken,
        registerNonce: ({ nonce }) => {
            const nonceEntry = nonceEntries.find(entry => entry.origin === origin);

            if (nonceEntry !== undefined) {
                nonceEntry.nonce = nonce;
            } else {
                nonceEntries.push({ origin, nonce });
            }
        },
        dpopProof: await generateES256DPoPProof({
            keyPair: dpopState.keys,
            url,
            accessToken,
            httpMethod,
            nonce
        }),
        reGenerateDpopProof: async () => {
            const result = await generateMaterialToUpgradeBearerRequestToDPoP(params);
            assert(result.isHandled, "4043840339");
            return result.dpopProof;
        }
    };
}
