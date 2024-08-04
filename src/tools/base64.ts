export function decodeBase64(encoded: string): string {
    return new TextDecoder().decode(Uint8Array.from(atob(encoded), c => c.charCodeAt(0)));
}

export function encodeBase64(decoded: string): string {
    return btoa(new TextEncoder().encode(decoded).reduce((acc, c) => acc + String.fromCharCode(c), ""));
}
