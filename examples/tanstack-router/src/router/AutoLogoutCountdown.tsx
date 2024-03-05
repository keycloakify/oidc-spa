import { useState, useEffect } from "react";
import { useOidc } from "oidc";

export function AutoLogoutCountdown() {
    const { isUserLoggedIn, enableAutoLogout } = useOidc();
    const [secondsBeforeAutoLogout, setSecondsBeforeAutoLogout] = useState<number | undefined>(
        undefined
    );

    useEffect(() => {
        if (!isUserLoggedIn) {
            return;
        }

        const { disableAutoLogout } = enableAutoLogout({
            countdown: {
                startTickAtSecondsLeft: 60,
                tickCallback: ({ secondsLeft }) => {
                    setSecondsBeforeAutoLogout(secondsLeft);
                },
                onReset: () => {
                    setSecondsBeforeAutoLogout(undefined);
                }
            }
        });

        return disableAutoLogout;
    }, [isUserLoggedIn, enableAutoLogout]);

    if (secondsBeforeAutoLogout === undefined) {
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
                <p>{secondsBeforeAutoLogout} seconds before automatic logout</p>
            </div>
        </div>
    );
}
