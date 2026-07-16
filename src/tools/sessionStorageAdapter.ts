import type { AsyncStorage } from "../vendor/frontend/oidc-client-ts";

export const sessionStorageAdapter: AsyncStorage = {
    get length() {
        return Promise.resolve(sessionStorage.length);
    },
    async clear() {
        sessionStorage.clear();
    },
    async getItem(key: string) {
        return sessionStorage.getItem(key);
    },
    async key(index: number) {
        return sessionStorage.key(index);
    },
    async removeItem(key: string) {
        sessionStorage.removeItem(key);
    },
    async setItem(key: string, value: string) {
        sessionStorage.setItem(key, value);
    }
};
