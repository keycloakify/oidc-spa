import { getIsLikelyDevServer } from "../tools/isLikelyDevServer";
import type { OidcProviderMetadata } from "./types";

export const WELL_KNOWN_PATH = "/.well-known/openid-configuration";

const { readSessionStorage, setSessionStorage } = (() => {
    function getSessionStorageKey(params: { issuerUri: string }) {
        const { issuerUri } = params;

        return `oidc-spa:openid-configuration:${issuerUri}`;
    }

    function readSessionStorage(params: { issuerUri: string }) {
        const { issuerUri } = params;

        const value = sessionStorage.getItem(getSessionStorageKey({ issuerUri }));

        if (value === null) {
            return undefined;
        }

        return JSON.parse(value) as OidcProviderMetadata;
    }

    function setSessionStorage(params: {
        issuerUri: string;
        oidcProviderMetadata: OidcProviderMetadata;
    }): void {
        const { issuerUri, oidcProviderMetadata } = params;

        sessionStorage.setItem(
            getSessionStorageKey({ issuerUri }),
            JSON.stringify(oidcProviderMetadata)
        );
    }

    return { readSessionStorage, setSessionStorage };
})();

const prOidcProviderMetadataByIssuerUri_inMemoryCache = new Map<
    string,
    Promise<OidcProviderMetadata | undefined>
>();

/** Can never throw, if it does it's on us. */
export function fetchOidcProviderMetadata(params: {
    issuerUri: string;
}): Promise<OidcProviderMetadata | undefined> {
    const { issuerUri } = params;

    from_in_memory_cache: {
        const prOidcProviderMetadata = prOidcProviderMetadataByIssuerUri_inMemoryCache.get(issuerUri);

        if (prOidcProviderMetadata === undefined) {
            break from_in_memory_cache;
        }

        return prOidcProviderMetadata;
    }

    from_sessionStorage_cache: {
        const oidcProviderMetadata = readSessionStorage({ issuerUri });

        if (oidcProviderMetadata === undefined) {
            break from_sessionStorage_cache;
        }

        return Promise.resolve(oidcProviderMetadata);
    }

    const prOidcProviderMetadata = (async () => {
        let oidcProviderMetadata: OidcProviderMetadata;

        const url = `${issuerUri}${WELL_KNOWN_PATH}`;

        try {
            const response = await fetch(url, {
                headers: {
                    Accept: "application/jwk-set+json, application/json"
                }
            });

            if (!response.ok) {
                throw new Error();
            }

            const obj = await response.json();

            {
                const { authorization_endpoint, token_endpoint } = obj as OidcProviderMetadata;

                if (typeof authorization_endpoint !== "string" || typeof token_endpoint !== "string") {
                    throw new Error();
                }
            }

            oidcProviderMetadata = obj;
        } catch {
            return undefined;
        }

        if (!getIsLikelyDevServer()) {
            setSessionStorage({ issuerUri, oidcProviderMetadata });
        }

        return oidcProviderMetadata;
    })();

    prOidcProviderMetadataByIssuerUri_inMemoryCache.set(issuerUri, prOidcProviderMetadata);

    return prOidcProviderMetadata;
}
