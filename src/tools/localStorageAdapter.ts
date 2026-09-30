import type { AsyncStorage } from "../vendor/frontend/oidc-client-ts";

export const localStorageAdapter: AsyncStorage = {
    get length() {
        return Promise.resolve(localStorage.length);
    },
    async clear() {
        localStorage.clear();
    },
    async getItem(key: string) {
        return localStorage.getItem(key);
    },
    async key(index: number) {
        return localStorage.key(index);
    },
    async removeItem(key: string) {
        localStorage.removeItem(key);
    },
    async setItem(key: string, value: string) {
        localStorage.setItem(key, value);
    }
};
