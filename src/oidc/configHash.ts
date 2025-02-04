import { fnv1aHash } from "../tools/fnv1aHash";

const SIGNATURE = "aa8689";

export function getConfigHash(params: { issuerUri: string; clientId: string }) {
    return `${fnv1aHash(`${params.issuerUri} ${params.clientId}`)}${SIGNATURE}`;
}

export function getIsConfigHash(params: { maybeConfigHash: string }): boolean {
    const { maybeConfigHash } = params;

    return maybeConfigHash.endsWith(SIGNATURE);
}
