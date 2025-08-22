import { useOidc } from "../oidc.client";

export function OidcInitializationErrorIfAny() {
    const { initializationError } = useOidc();

    if (initializationError === undefined) {
        return null;
    }

    return (
        <div style={{ color: "red" }}>
            {initializationError.isAuthServerLikelyDown
                ? "Sorry our Auth server is down"
                : `Initialization error: ${initializationError.message}`}
        </div>
    );
}
