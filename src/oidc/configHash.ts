import { fnv1aHash } from "../tools/fnv1aHash";

const SIGNATURE = "af794b1e3a";

export function getConfigHash(params: { issuerUri: string; clientId: string }) {
    return `${fnv1aHash(`${params.issuerUri} ${params.clientId}`)}${SIGNATURE}`;
}

const CONFIG_HASH_REGEXP = new RegExp(`^[0-9a-f]{8}${SIGNATURE}$`);

export function getIsConfigHash(params: { maybeConfigHash: string }): boolean {
    const { maybeConfigHash } = params;

    return CONFIG_HASH_REGEXP.test(maybeConfigHash);
}
