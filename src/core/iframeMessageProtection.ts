import { assert } from "../tools/tsafe/assert";
import { asymmetricEncrypt, asymmetricDecrypt, generateKeys } from "../tools/asymmetricEncryption";
import { type AuthResponse } from "./AuthResponse";

const setItem_real = Storage.prototype.setItem;

const SESSION_STORAGE_PREFIX = "oidc-spa_iframe_authResponse_publicKey_";

export function preventSessionStorageSetItemOfPublicKeyByThirdParty() {
    const setItem_protected = function setItem(this: any, key: string, value: string): void {
        if (key.startsWith(SESSION_STORAGE_PREFIX)) {
            throw new Error(
                "Attack prevented by oidc-spa. You have malicious code running in your system"
            );
        }

        return setItem_real.call(this, key, value);
    };

    {
        const pd = Object.getOwnPropertyDescriptor(Storage.prototype, "setItem");

        assert(pd !== undefined);

        Object.defineProperty(Storage.prototype, "setItem", {
            enumerable: pd.enumerable,
            writable: pd.writable,
            value: setItem_protected
        });
    }
}

const ENCRYPTED_AUTH_RESPONSES_PREFIX = "oidc-spa_encrypted_authResponse_";

function getSessionStorageKey(params: { stateUrlParamValue: string }) {
    const { stateUrlParamValue } = params;

    return `${SESSION_STORAGE_PREFIX}${stateUrlParamValue}`;
}

export async function initIframeMessageProtection(params: {
    stateUrlParamValue: string;
    log: typeof console.log | undefined;
}) {
    const { stateUrlParamValue, log } = params;

    const { publicKey, privateKey } = await generateKeys();

    const sessionStorageKey = getSessionStorageKey({ stateUrlParamValue });

    log?.(
        `Writing iframe messaging protection publicKey for state: ${stateUrlParamValue} at sessionStorage -> ${sessionStorageKey}`
    );

    setItem_real.call(sessionStorage, sessionStorageKey, publicKey);

    function getIsEncryptedAuthResponse(params: { message: unknown }): boolean {
        const { message } = params;

        return typeof message === "string" && message.startsWith(ENCRYPTED_AUTH_RESPONSES_PREFIX);
    }

    async function decodeEncryptedAuth(params: {
        encryptedAuthResponse: string;
    }): Promise<{ authResponse: AuthResponse }> {
        const { encryptedAuthResponse } = params;

        const { message: authResponse_str } = await asymmetricDecrypt({
            encryptedMessage: encryptedAuthResponse.slice(ENCRYPTED_AUTH_RESPONSES_PREFIX.length),
            privateKey
        });

        const authResponse: AuthResponse = JSON.parse(authResponse_str);

        return { authResponse };
    }

    function clearSessionStoragePublicKey() {
        log?.(`Clearing session storage public key at ${sessionStorageKey}`);
        sessionStorage.removeItem(sessionStorageKey);
    }

    return { getIsEncryptedAuthResponse, decodeEncryptedAuth, clearSessionStoragePublicKey };
}

export async function encryptAuthResponse(params: { authResponse: AuthResponse }) {
    const { authResponse } = params;

    const publicKey = sessionStorage.getItem(
        getSessionStorageKey({ stateUrlParamValue: authResponse.state })
    );

    assert(publicKey !== null, `2293302 no publicKey for state ${authResponse.state}`);

    const { encryptedMessage: encryptedMessage_withoutPrefix } = await asymmetricEncrypt({
        publicKey,
        message: JSON.stringify(authResponse)
    });

    const encryptedMessage = `${ENCRYPTED_AUTH_RESPONSES_PREFIX}${encryptedMessage_withoutPrefix}`;

    return { encryptedMessage };
}
