import { useOidc } from "../oidc.client";

export function OidcInitializationErrorIfAny() {
    const { initializationError } = useOidc();

    if (initializationError === undefined) {
        return null;
    }

    return (
        <pre style={{ color: "red", textAlign: "left", paddingLeft: 20 }}>
            {initializationError.isAuthServerLikelyDown
                ? "Sorry our Auth server is down"
                : `Initialization error: ${initializationError.message}`}
        </pre>
    );
}
