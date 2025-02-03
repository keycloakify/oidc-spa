import { fnv1aHashToHex } from "../tools/fnv1aHashToHex";

const SIGNATURE = "9c8689";

export function getConfigHash(params: { issuerUri: string; clientId: string }) {
    return `${SIGNATURE}${fnv1aHashToHex(`${params.issuerUri} ${params.clientId}`)}`;
}

export function getIsConfigHash(params: { maybeConfigHash: string }): boolean {
    const { maybeConfigHash } = params;

    return maybeConfigHash.startsWith(SIGNATURE);
}
