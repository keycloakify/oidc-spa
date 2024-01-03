import { useOidc } from "oidc";

export function ProtectedPage() {
    // Here we can safely assume that the user is logged in.
    const { oidcTokens } = useOidc({ assertUserLoggedIn: true });

    return (
        <h4>
            Hello {oidcTokens.decodedIdToken.preferred_username}
            <br />
            The page you are currently viewing can only be accessed when you are authenticated.
        </h4>
    );
}
