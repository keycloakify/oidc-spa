import { fnv1aHashToHex } from "../tools/fnv1aHashToHex";

export function getConfigHash(params: { issuerUri: string; clientId: string }) {
    return fnv1aHashToHex(`${params.issuerUri} ${params.clientId}`);
}
