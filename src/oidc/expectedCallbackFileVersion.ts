const EXPECTED_CALLBACK_FILE_VERSION_KEY = "oidc-spa.callback-file-version";

export function setExpectedCallbackFileVersion() {
    localStorage.setItem(EXPECTED_CALLBACK_FILE_VERSION_KEY, "2");
}
