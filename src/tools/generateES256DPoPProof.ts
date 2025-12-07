export async function generateES256DPoPProof(params: {
    keyPair: CryptoKeyPair;
    url: string;
    accessToken: string;
    httpMethod: string;
    nonce: string | undefined;
}): Promise<string> {
    const { keyPair, url, accessToken, httpMethod, nonce } = params;

    const payload: Record<string, string | number> = {
        jti: window.crypto.randomUUID(),
        htm: httpMethod,
        htu: url,
        iat: Math.floor(Date.now() / 1000)
    };

    const hashedToken = await hash("SHA-256", accessToken);
    payload.ath = encodeBase64Url(hashedToken);

    if (nonce !== undefined) {
        payload.nonce = nonce;
    }

    const publicJwk = await crypto.subtle.exportKey("jwk", keyPair.publicKey);
    const header = {
        alg: "ES256",
        typ: "dpop+jwt",
        jwk: {
            crv: publicJwk.crv,
            kty: publicJwk.kty,
            x: publicJwk.x,
            y: publicJwk.y
        }
    };
    return await generateSignedJwt(header, payload, keyPair.privateKey);
}

async function generateSignedJwt(
    header: object,
    payload: object,
    privateKey: CryptoKey
): Promise<string> {
    const encodedHeader = encodeBase64Url(new TextEncoder().encode(JSON.stringify(header)));
    const encodedPayload = encodeBase64Url(new TextEncoder().encode(JSON.stringify(payload)));
    const encodedToken = `${encodedHeader}.${encodedPayload}`;

    const signature = await window.crypto.subtle.sign(
        {
            name: "ECDSA",
            hash: { name: "SHA-256" }
        },
        privateKey,
        new TextEncoder().encode(encodedToken)
    );

    const encodedSignature = encodeBase64Url(new Uint8Array(signature));
    return `${encodedToken}.${encodedSignature}`;
}

const toBase64 = (val: ArrayBuffer): string =>
    btoa([...new Uint8Array(val)].map(chr => String.fromCharCode(chr)).join(""));

const encodeBase64Url = (input: Uint8Array) =>
    toBase64(input).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");

const hash = async (alg: string, message: string): Promise<Uint8Array> => {
    const msgUint8 = new TextEncoder().encode(message);
    const hashBuffer = await crypto.subtle.digest(alg, msgUint8);
    return new Uint8Array(hashBuffer);
};
