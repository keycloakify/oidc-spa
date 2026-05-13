import { Preferences } from "@capacitor/preferences";
import type { AsyncStorage } from "../vendor/frontend/oidc-client-ts";

/**
 * Capacitor Preferences-backed storage adapter.
 *
 * Suitable for persistence, but not encrypted at rest by default.
 * For production use, choose the storage strategy based on your security requirements.
 * If persisted tokens need stronger protection, wrap this adapter with secure storage
 * or a biometric-gated storage implementation.
 */
export class CapacitorPreferencesStorageAdapter implements AsyncStorage {
    readonly #scopePrefix: string;

    constructor(params: { scope?: string } = {}) {
        const { scope = "oidc-spa" } = params;

        const normalizedScope = (scope.endsWith(":") ? scope.slice(0, -1) : scope) || "oidc-spa";

        this.#scopePrefix = `${normalizedScope}:`;
    }

    #toScopedKey(key: string): string {
        return `${this.#scopePrefix}${key}`;
    }

    #getUnscopedKey(scopedKey: string): string {
        return scopedKey.slice(this.#scopePrefix.length);
    }

    async #getScopedKeys(): Promise<string[]> {
        const { keys } = await Preferences.keys();

        return keys
            .filter(key => key.startsWith(this.#scopePrefix))
            .map(key => this.#getUnscopedKey(key))
            .sort();
    }

    get length(): Promise<number> {
        return this.#getScopedKeys().then(keys => keys.length);
    }

    async clear(): Promise<void> {
        const scopedKeys = await this.#getScopedKeys();

        for (const key of scopedKeys) {
            await this.removeItem(key);
        }
    }

    async getItem(key: string): Promise<string | null> {
        const { value } = await Preferences.get({ key: this.#toScopedKey(key) });
        return value;
    }

    async key(index: number): Promise<string | null> {
        const keys = await this.#getScopedKeys();

        return keys[index] ?? null;
    }

    async removeItem(key: string): Promise<void> {
        await Preferences.remove({ key: this.#toScopedKey(key) });
    }

    async setItem(key: string, value: string): Promise<void> {
        await Preferences.set({ key: this.#toScopedKey(key), value });
    }
}
