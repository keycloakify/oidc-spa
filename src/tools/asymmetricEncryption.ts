type AsymmetricKeys = {
    publicKey: string; // base64-encoded JSON export of CryptoKey
    privateKey: string; // base64-encoded JSON export of CryptoKey
};

const INFO_LABEL = "oidc-spa/tools/asymmetricEncryption";

export async function generateKeys(): Promise<AsymmetricKeys> {
    const keyPair = await crypto.subtle.generateKey(
        {
            name: "ECDH",
            namedCurve: "P-256"
        },
        true,
        ["deriveKey", "deriveBits"]
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
        ["deriveKey", "deriveBits"]
    );

    const sharedSecret = await crypto.subtle.deriveBits(
        {
            name: "ECDH",
            public: importedPublicKey
        },
        ephemeralKeyPair.privateKey,
        256
    );

    const salt = crypto.getRandomValues(new Uint8Array(16));
    const infoBytes = new TextEncoder().encode(INFO_LABEL);

    const hkdfKey = await crypto.subtle.importKey("raw", sharedSecret, "HKDF", false, ["deriveKey"]);

    const derivedKey = await crypto.subtle.deriveKey(
        {
            name: "HKDF",
            hash: "SHA-256",
            salt,
            info: infoBytes
        },
        hkdfKey,
        { name: "AES-GCM", length: 256 },
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
        salt: Array.from(salt),
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
        salt,
        ciphertext
    }: {
        ephemeralPubKey: JsonWebKey;
        iv: number[];
        salt: number[];
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
        ["deriveKey", "deriveBits"]
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

    const sharedSecret = await crypto.subtle.deriveBits(
        {
            name: "ECDH",
            public: importedEphemeralPubKey
        },
        importedPrivateKey,
        256
    );

    const infoBytes = new TextEncoder().encode(INFO_LABEL);

    const hkdfKey = await crypto.subtle.importKey("raw", sharedSecret, "HKDF", false, ["deriveKey"]);

    const derivedKey = await crypto.subtle.deriveKey(
        {
            name: "HKDF",
            hash: "SHA-256",
            salt: new Uint8Array(salt),
            info: infoBytes
        },
        hkdfKey,
        { name: "AES-GCM", length: 256 },
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
