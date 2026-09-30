import type { NonPostableEvt } from "../tools/Evt";
import type { AsyncStorage } from "../vendor/frontend/oidc-client-ts";

export function createGetIsNewBrowserSession(params: {
    configId: string;
    evtInitializationOutcomeUserNotLoggedIn: NonPostableEvt<void>;
    isNativeApp: boolean;
    storageAdapter: AsyncStorage;
}) {
    const { configId, evtInitializationOutcomeUserNotLoggedIn, isNativeApp, storageAdapter } = params;

    const SESSION_STORAGE_KEY = `oidc-spa.subject-id:${configId}`;
    const NATIVE_SESSION_STORAGE_KEY = `oidc-spa.subject-session:${configId}`;
    const NATIVE_PROTECTED_STORAGE_KEY = `oidc-spa:subject-session:${configId}`;

    {
        const { unsubscribe } = evtInitializationOutcomeUserNotLoggedIn.subscribe(() => {
            unsubscribe();
            sessionStorage.removeItem(SESSION_STORAGE_KEY);
            if (isNativeApp) {
                sessionStorage.removeItem(NATIVE_SESSION_STORAGE_KEY);
                void storageAdapter.removeItem(NATIVE_PROTECTED_STORAGE_KEY).catch(() => {});
            }
        });
    }

    async function getIsNewBrowserSession(params: { subjectId: string }): Promise<boolean> {
        const { subjectId } = params;

        if (isNativeApp) {
            // Remove identifiers persisted by older versions before writing an opaque marker.
            sessionStorage.removeItem(SESSION_STORAGE_KEY);

            let sessionId = sessionStorage.getItem(NATIVE_SESSION_STORAGE_KEY);
            if (sessionId === null) {
                sessionId = Array.from(window.crypto.getRandomValues(new Uint8Array(16)))
                    .map(byte => byte.toString(16).padStart(2, "0"))
                    .join("");
                sessionStorage.setItem(NATIVE_SESSION_STORAGE_KEY, sessionId);
            }

            const protectedValue = await storageAdapter.getItem(NATIVE_PROTECTED_STORAGE_KEY);
            if (protectedValue !== null) {
                try {
                    const parsed: unknown = JSON.parse(protectedValue);
                    if (
                        parsed instanceof Object &&
                        "sessionId" in parsed &&
                        parsed.sessionId === sessionId &&
                        "subjectId" in parsed &&
                        parsed.subjectId === subjectId
                    ) {
                        return false;
                    }
                } catch {}
            }

            await storageAdapter.setItem(
                NATIVE_PROTECTED_STORAGE_KEY,
                JSON.stringify({ sessionId, subjectId })
            );
            return true;
        }

        const subjectId_sessionStorage = sessionStorage.getItem(SESSION_STORAGE_KEY);

        if (subjectId_sessionStorage === null) {
            sessionStorage.setItem(SESSION_STORAGE_KEY, subjectId);
            return true;
        }

        if (subjectId !== subjectId_sessionStorage) {
            sessionStorage.setItem(SESSION_STORAGE_KEY, subjectId);
            return true;
        }

        return false;
    }

    return { getIsNewBrowserSession };
}
