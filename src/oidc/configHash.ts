import { fnv1aHash } from "../tools/fnv1aHash";

const SIGNATURE = "af7";

export function getConfigHash(params: { issuerUri: string; clientId: string }) {
    return `${fnv1aHash(`${params.issuerUri} ${params.clientId}`).slice(0, -3)}${SIGNATURE}`;
}

const CONFIG_HASH_REGEXP = new RegExp(`^[0-9a-f]{5}${SIGNATURE}$`);

export function getIsConfigHash(params: { maybeConfigHash: string }): boolean {
    const { maybeConfigHash } = params;

    return CONFIG_HASH_REGEXP.test(maybeConfigHash);
}
