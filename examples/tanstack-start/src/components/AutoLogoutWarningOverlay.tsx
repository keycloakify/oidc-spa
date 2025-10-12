import { useOidc } from "src/oidc";

export function AutoLogoutWarningOverlay() {
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
                zIndex: 1000
            }}
        >
            <div>
                <p>Are you still there?</p>
                <p>You will be logged out in {autoLogoutState.secondsLeftBeforeAutoLogout}</p>
            </div>
        </div>
    );
}
