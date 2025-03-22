import { useState, useEffect } from "react";
import { useOidc } from "../oidc";

export function AutoLogoutCountdown() {
    const { isUserLoggedIn, subscribeToAutoLogoutCountdown } = useOidc();
    const [secondsLeft, setSecondsLeft] = useState<number | undefined>(undefined);

    useEffect(
        () => {
            if (!isUserLoggedIn) {
                return;
            }

            const { unsubscribeFromAutoLogoutCountdown } = subscribeToAutoLogoutCountdown(
                ({ secondsLeft }) =>
                    setSecondsLeft(
                        secondsLeft === undefined || secondsLeft > 60 ? undefined : secondsLeft
                    )
            );

            return () => {
                unsubscribeFromAutoLogoutCountdown();
            };
        },
        // NOTE: These dependency array could very well be empty
        // we're just making react-hooks/exhaustive-deps happy.
        // Unless you're hot swapping the oidc context isUserLoggedIn
        // and subscribeToAutoLogoutCountdown never change for the
        // lifetime of the app.
        [isUserLoggedIn, subscribeToAutoLogoutCountdown]
    );

    if (secondsLeft === undefined) {
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
                <p>You will be logged out in {secondsLeft}</p>
            </div>
        </div>
    );
}
