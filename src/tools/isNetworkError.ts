/**
 * Tells whether an error thrown by `fetch()` (or by something that calls it,
 * like oidc-client-ts, which re-throws it unwrapped) is a network failure.
 *
 * The Fetch spec requires a network failure to reject with a `TypeError`, but
 * it does not specify the message, and every engine words it differently:
 *
 *  - Chromium: "Failed to fetch"
 *  - Firefox:  "NetworkError when attempting to fetch resource."
 *  - Safari:   "Load failed"
 *
 * Matching on the text therefore only ever recognises one engine, and silently
 * skips the recovery path everywhere else. Match on the type instead.
 */
export function isNetworkError(error: unknown): boolean {
    return error instanceof TypeError;
}
