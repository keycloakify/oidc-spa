export function getIsNewBrowserSession(params: { configId: string; subjectId: string }): boolean {
    const { configId, subjectId } = params;

    const SESSION_STORAGE_KEY = `oidc-spa.subject-id:${configId}`;

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
