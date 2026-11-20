let isEnabled = false;

export function enableStateDataCookie() {
    isEnabled = true;
}

export function getIsStateDataCookieEnabled() {
    return isEnabled;
}
