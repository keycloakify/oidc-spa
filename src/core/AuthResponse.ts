import { addOrUpdateSearchParam } from "../tools/urlSearchParams";
import {
    createEphemeralSessionStorage,
    type EphemeralSessionStorage
} from "../tools/EphemeralSessionStorage";

export type AuthResponse = {
    state: string;
    [key: string]: string | undefined;
};

export function authResponseToUrl(authResponse: AuthResponse): string {
    let authResponseUrl = "https://dummy.com";

    for (const [name, value] of Object.entries(authResponse)) {
        if (value === undefined) {
            continue;
        }
        authResponseUrl = addOrUpdateSearchParam({
            url: authResponseUrl,
            name,
            value,
            encodeMethod: "www-form"
        });
    }

    authResponseUrl = `${authResponseUrl}#${authResponseUrl.split("?")[1]}`;

    return authResponseUrl;
}

export const { setPersistedRedirectAuthResponses, getPersistedRedirectAuthResponses } = (() => {
    const { getEphemeralSessionStorage } = (() => {
        let cache: EphemeralSessionStorage | undefined = undefined;
        const getEphemeralSessionStorage = () =>
            (cache ??= createEphemeralSessionStorage({
                sessionStorageTtlMs: 30_000
            }));
        return { getEphemeralSessionStorage };
    })();

    const KEY = "oidc-spa:persisted-redirect-auth-response";

    function setPersistedRedirectAuthResponses(params: { authResponses: AuthResponse[] }) {
        const { authResponses } = params;

        const storage = getEphemeralSessionStorage();
        storage.persistCurrentStateAndSubsequentChanges();

        storage.setItem(KEY, JSON.stringify(authResponses));
    }

    function getPersistedRedirectAuthResponses(): { authResponses: AuthResponse[] } {
        const value = getEphemeralSessionStorage().getItem(KEY);

        const authResponses: AuthResponse[] = value === null ? [] : JSON.parse(value);

        return { authResponses };
    }

    return { setPersistedRedirectAuthResponses, getPersistedRedirectAuthResponses };
})();
