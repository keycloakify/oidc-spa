export function generateUrlSafeRandom(params: { length: number }): string {
    const { length } = params;

    // Compute required byte length before encoding
    const byteLength = Math.ceil((length * 3) / 4);

    const crypto = window.crypto || (window as any).msCrypto;
    const array = new Uint8Array(byteLength);
    crypto.getRandomValues(array);

    // Encode and apply Base64URL transformations
    let base64url = btoa(String.fromCharCode(...array))
        .replace(/\+/g, "-") // Base64URL encoding
        .replace(/\//g, "_")
        .replace(/=+$/, ""); // Remove padding

    // Trim or regenerate if too short
    if (base64url.length > length) {
        return base64url.substring(0, length);
    } else if (base64url.length < length) {
        // If trimming removes too much, recursively generate more
        return base64url + generateUrlSafeRandom({ length: length - base64url.length });
    }

    return base64url;
}
