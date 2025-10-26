import { Suspense } from "react";
import { useOidc } from "~/oidc";

/** See: https://docs.oidc-spa.dev/auto-logout */
export function AutoLogoutWarningOverlay() {
    return (
        <Suspense>
            <AutoLogoutWarningOverlay_actual />
        </Suspense>
    );
}

function AutoLogoutWarningOverlay_actual() {
    const { autoLogoutState } = useOidc();

    if (!autoLogoutState.shouldDisplayWarning) {
        return null;
    }

    return (
        <div
            // Full screen overlay, blurred background
            style={{
                position: "fixed",
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundColor: "rgba(0,0,0,0.5)",
                backdropFilter: "blur(10px)",
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
                zIndex: 1000,
                color: "white"
            }}
        >
            <div>
                <p>Are you still there?</p>
                <p>You will be logged out in {autoLogoutState.secondsLeftBeforeAutoLogout}</p>
                {/* NOTE: You can configure how long before autoLogout we start displaying
                        this warning by providing `startCountdownSecondsBeforeAutoLogout` 
                        to bootstrapOidc()
                    */}
            </div>
        </div>
    );
}
