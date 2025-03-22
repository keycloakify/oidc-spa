import type { NonPostableEvt } from "../tools/Evt";

export function createGetIsNewBrowserSession(params: {
    configId: string;
    evtUserNotLoggedIn: NonPostableEvt<void>;
}) {
    const { configId, evtUserNotLoggedIn } = params;

    const SESSION_STORAGE_KEY = `oidc-spa.subject-id:${configId}`;

    {
        const { unsubscribe } = evtUserNotLoggedIn.subscribe(() => {
            unsubscribe();
            sessionStorage.removeItem(SESSION_STORAGE_KEY);
        });
    }

    function getIsNewBrowserSession(params: { subjectId: string }): boolean {
        const { subjectId } = params;

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
