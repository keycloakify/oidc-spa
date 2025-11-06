import { assert } from "../tools/tsafe/assert";
import { asymmetricEncrypt, asymmetricDecrypt, generateKeys } from "../tools/asymmetricEncryption";
import { type AuthResponse } from "./AuthResponse";

let capturedApis:
    | {
          setItem: typeof localStorage.setItem;
          sessionStorage: typeof window.sessionStorage;
          setTimeout: typeof window.setTimeout;
          clearTimeout: typeof window.clearTimeout;
          alert: typeof window.alert;
      }
    | undefined = undefined;

const SESSION_STORAGE_PREFIX = "oidc-spa_iframe_authResponse_publicKey_";

const getProtectedTimer_set = new Set<() => number | undefined>();

/**
 * To call while still in the safe window where no other code
 * has been evaluated and only before we're about to actually start the App.
 */
export function iframeMessageProtection_captureAndLockBuiltins() {
    capturedApis = {
        setItem: Storage.prototype.setItem,
        sessionStorage: window.sessionStorage,
        setTimeout: window.setTimeout,
        clearTimeout: window.clearTimeout,
        alert: window.alert
    };

    // Ensure, at least from main window we cannot simply write on the public key.
    {
        const setItem_protected = function setItem(this: any, key: string, value: string): void {
            if (key.startsWith(SESSION_STORAGE_PREFIX)) {
                throw new Error(
                    "Attack prevented by oidc-spa. You have malicious code running in your system"
                );
            }

            assert(capturedApis !== undefined);

            return capturedApis.setItem.call(this, key, value);
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

    window.clearTimeout = function clearTimeout(timer) {
        for (const getProtectedTimer of getProtectedTimer_set) {
            const timer_protected = getProtectedTimer();
            if (timer_protected === undefined) {
                continue;
            }
            if (timer_protected === timer) {
                // Probably an attack but potentially not so avoiding hard crash
                return;
            }
        }

        assert(capturedApis !== undefined);

        capturedApis.clearTimeout.call(window, timer);
    };
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

    let timer: number | undefined = undefined;

    const getProtectedTimer = () => timer;

    getProtectedTimer_set.add(getProtectedTimer);

    function setSessionStoragePublicKey() {
        assert(capturedApis !== undefined);

        const { setItem } = capturedApis;

        setItem.call(capturedApis.sessionStorage, sessionStorageKey, publicKey);
    }

    function startSessionStoragePublicKeyMaliciousWriteDetection() {
        assert(capturedApis !== undefined);

        const { alert, setTimeout } = capturedApis;

        sessionStorage.removeItem(sessionStorageKey);

        const checkTimeoutCallback = () => {
            const publicKey_inStorage = sessionStorage.getItem(sessionStorageKey);

            if (publicKey_inStorage !== null && publicKey_inStorage !== publicKey) {
                while (true) {
                    alert(
                        [
                            "⚠️ Security Alert:",
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
            timer = setTimeout(checkTimeoutCallback, 5);
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
        assert(capturedApis !== undefined);
        const { clearTimeout } = capturedApis;
        sessionStorage.removeItem(sessionStorageKey);
        clearTimeout(timer);
        getProtectedTimer_set.delete(getProtectedTimer);
    }

    return {
        getIsReadyToReadPublicKeyMessage,
        startSessionStoragePublicKeyMaliciousWriteDetection,
        setSessionStoragePublicKey,
        getIsEncryptedAuthResponse,
        decodeEncryptedAuth,
        clearSessionStoragePublicKey
    };
}

export async function postEncryptedAuthResponseToParent(params: { authResponse: AuthResponse }) {
    const { authResponse } = params;

    parent.postMessage(getReadyMessage({ stateUrlParamValue: authResponse.state }), location.origin);

    await new Promise<void>(resolve => setTimeout(resolve, 2));

    let publicKey: string | null;

    {
        let sessionStorageKey = getSessionStorageKey({ stateUrlParamValue: authResponse.state });

        while ((publicKey = sessionStorage.getItem(sessionStorageKey)) === null) {
            await new Promise<void>(resolve => setTimeout(resolve, 2));
        }
    }

    await new Promise<void>(resolve => setTimeout(resolve, 7));

    const { encryptedMessage: encryptedMessage_withoutPrefix } = await asymmetricEncrypt({
        publicKey,
        message: JSON.stringify(authResponse)
    });

    const encryptedMessage = `${ENCRYPTED_AUTH_RESPONSES_PREFIX}${authResponse.state}${encryptedMessage_withoutPrefix}`;

    parent.postMessage(encryptedMessage, location.origin);
}
