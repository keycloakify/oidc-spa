import { assert } from "../tools/tsafe/assert";
import { asymmetricEncrypt, asymmetricDecrypt, generateKeys } from "../tools/asymmetricEncryption";
import { type AuthResponse } from "./AuthResponse";

const setItem_real = Storage.prototype.setItem;
const sessionStorage_original = window.sessionStorage;
const setTimeout_original: typeof setTimeout = window.setTimeout;
const alert_original = window.alert;

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

function getSessionStorageKey(params: { stateUrlParamValue: string }) {
    const { stateUrlParamValue } = params;

    return `${SESSION_STORAGE_PREFIX}${stateUrlParamValue}`;
}

const ENCRYPTED_AUTH_RESPONSES_PREFIX = "oidc-spa_encrypted_authResponse_";

function getIsEncryptedAuthResponse(params: { message: unknown; stateUrlParamValue: string }): boolean {
    const { message, stateUrlParamValue } = params;

    return (
        typeof message === "string" &&
        message.startsWith(`${ENCRYPTED_AUTH_RESPONSES_PREFIX}${stateUrlParamValue}`)
    );
}

function getReadyMessage(params: { stateUrlParamValue: string }) {
    const { stateUrlParamValue } = params;
    return `oidc-spa_ready_to_read_publicKey_${stateUrlParamValue}`;
}

function getIsReadyToReadPublicKeyMessage(params: { message: unknown; stateUrlParamValue: string }) {
    const { message, stateUrlParamValue } = params;
    return message === getReadyMessage({ stateUrlParamValue });
}

export async function initIframeMessageProtection(params: { stateUrlParamValue: string }) {
    const { stateUrlParamValue } = params;

    const { publicKey, privateKey } = await generateKeys();

    const sessionStorageKey = getSessionStorageKey({ stateUrlParamValue });

    let timer: ReturnType<typeof setTimeout> | undefined = undefined;

    function setSessionStoragePublicKey() {
        setItem_real.call(sessionStorage_original, sessionStorageKey, publicKey);

        const checkTimeoutCallback = () => {
            if (sessionStorage.getItem(sessionStorageKey) !== publicKey) {
                while (true) {
                    alert_original(
                        [
                            "⚠️  Security Alert:",
                            "oidc-spa detected an attack attempt.",
                            "For your safety, please close this tab immediately",
                            "and notify the site administrator."
                        ].join(" ")
                    );
                }
            }
            check();
        };

        function check() {
            timer = setTimeout_original(checkTimeoutCallback, 5);
        }

        check();
    }

    async function decodeEncryptedAuth(params: {
        encryptedAuthResponse: string;
    }): Promise<{ authResponse: AuthResponse }> {
        const { encryptedAuthResponse } = params;

        const { message: authResponse_str } = await asymmetricDecrypt({
            encryptedMessage: encryptedAuthResponse.slice(
                ENCRYPTED_AUTH_RESPONSES_PREFIX.length + stateUrlParamValue.length
            ),
            privateKey
        });

        const authResponse: AuthResponse = JSON.parse(authResponse_str);

        return { authResponse };
    }

    function clearSessionStoragePublicKey() {
        sessionStorage.removeItem(sessionStorageKey);
        clearTimeout(timer);
    }

    return {
        getIsReadyToReadPublicKeyMessage,
        setSessionStoragePublicKey,
        getIsEncryptedAuthResponse,
        decodeEncryptedAuth,
        clearSessionStoragePublicKey
    };
}

export async function postEncryptedAuthResponseToParent(params: { authResponse: AuthResponse }) {
    const { authResponse } = params;

    parent.postMessage(getReadyMessage({ stateUrlParamValue: authResponse.state }), location.origin);

    const readPublicKey = () =>
        sessionStorage.getItem(getSessionStorageKey({ stateUrlParamValue: authResponse.state }));

    await new Promise<void>(resolve => setTimeout(resolve, 2));

    while (readPublicKey() === null) {
        await new Promise<void>(resolve => setTimeout(resolve, 2));
    }

    await new Promise<void>(resolve => setTimeout(resolve, 7));

    const publicKey = readPublicKey();

    assert(publicKey !== null, "2293303");

    const { encryptedMessage: encryptedMessage_withoutPrefix } = await asymmetricEncrypt({
        publicKey,
        message: JSON.stringify(authResponse)
    });

    const encryptedMessage = `${ENCRYPTED_AUTH_RESPONSES_PREFIX}${authResponse.state}${encryptedMessage_withoutPrefix}`;

    parent.postMessage(encryptedMessage, location.origin);
}
