export function getConfigId(params: { issuerUri: string; clientId: string }) {
    return `${params.issuerUri}:${params.clientId}`;
}
