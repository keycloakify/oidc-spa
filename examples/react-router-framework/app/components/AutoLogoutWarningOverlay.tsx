import { useOidc } from "~/oidc";

/** See: https://docs.oidc-spa.dev/auto-logout */
export function AutoLogoutWarningOverlay() {
    const { autoLogoutState } = useOidc();

    if (!autoLogoutState.shouldDisplayWarning) {
        return null;
    }

    return (
        <div className="session-overlay">
            <div>
                <h2>Are you still there?</h2>
                <p>You will be logged out in {autoLogoutState.secondsLeftBeforeAutoLogout} seconds.</p>
                {/* Configure warnUserSecondsBeforeAutoLogout in app/oidc.ts. */}
            </div>
        </div>
    );
}
