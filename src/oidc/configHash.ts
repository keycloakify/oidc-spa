import { fnv1aHash } from "../tools/fnv1aHash";

export function getConfigHash(params: { issuerUri: string; clientId: string }) {
    return fnv1aHash(`${params.issuerUri} ${params.clientId}`);
}
