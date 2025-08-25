type AsymmetricKeys = {
    publicKey: string; // base64-encoded JSON export of CryptoKey
    privateKey: string; // base64-encoded JSON export of CryptoKey
};

export async function generateKeys(): Promise<AsymmetricKeys> {
    const keyPair = await crypto.subtle.generateKey(
        {
            name: "ECDH",
            namedCurve: "P-256"
        },
        true,
        ["deriveKey"]
    );

    const publicKeyRaw = await crypto.subtle.exportKey("jwk", keyPair.publicKey);
    const privateKeyRaw = await crypto.subtle.exportKey("jwk", keyPair.privateKey);

    return {
        publicKey: btoa(JSON.stringify(publicKeyRaw)),
        privateKey: btoa(JSON.stringify(privateKeyRaw))
    };
}

export async function asymmetricEncrypt(params: {
    publicKey: string;
    message: string;
}): Promise<{ encryptedMessage: string }> {
    const { publicKey, message } = params;

    const importedPublicKey = await crypto.subtle.importKey(
        "jwk",
        JSON.parse(atob(publicKey)),
        {
            name: "ECDH",
            namedCurve: "P-256"
        },
        false,
        []
    );

    const ephemeralKeyPair = await crypto.subtle.generateKey(
        {
            name: "ECDH",
            namedCurve: "P-256"
        },
        true,
        ["deriveKey"]
    );

    const derivedKey = await crypto.subtle.deriveKey(
        {
            name: "ECDH",
            public: importedPublicKey
        },
        ephemeralKeyPair.privateKey,
        {
            name: "AES-GCM",
            length: 256
        },
        false,
        ["encrypt"]
    );

    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encodedMessage = new TextEncoder().encode(message);

    const ciphertext = await crypto.subtle.encrypt(
        {
            name: "AES-GCM",
            iv
        },
        derivedKey,
        encodedMessage
    );

    const ephemeralPubKeyRaw = await crypto.subtle.exportKey("jwk", ephemeralKeyPair.publicKey);

    const payload = {
        ephemeralPubKey: ephemeralPubKeyRaw,
        iv: Array.from(iv),
        ciphertext: Array.from(new Uint8Array(ciphertext))
    };

    return {
        encryptedMessage: btoa(JSON.stringify(payload))
    };
}

export async function asymmetricDecrypt(params: {
    privateKey: string;
    encryptedMessage: string;
}): Promise<{ message: string }> {
    const { privateKey, encryptedMessage } = params;

    const {
        ephemeralPubKey,
        iv,
        ciphertext
    }: {
        ephemeralPubKey: JsonWebKey;
        iv: number[];
        ciphertext: number[];
    } = JSON.parse(atob(encryptedMessage));

    const importedPrivateKey = await crypto.subtle.importKey(
        "jwk",
        JSON.parse(atob(privateKey)),
        {
            name: "ECDH",
            namedCurve: "P-256"
        },
        false,
        ["deriveKey"]
    );

    const importedEphemeralPubKey = await crypto.subtle.importKey(
        "jwk",
        ephemeralPubKey,
        {
            name: "ECDH",
            namedCurve: "P-256"
        },
        false,
        []
    );

    const derivedKey = await crypto.subtle.deriveKey(
        {
            name: "ECDH",
            public: importedEphemeralPubKey
        },
        importedPrivateKey,
        {
            name: "AES-GCM",
            length: 256
        },
        false,
        ["decrypt"]
    );

    const decryptedBuffer = await crypto.subtle.decrypt(
        {
            name: "AES-GCM",
            iv: new Uint8Array(iv)
        },
        derivedKey,
        new Uint8Array(ciphertext)
    );

    return {
        message: new TextDecoder().decode(decryptedBuffer)
    };
}
