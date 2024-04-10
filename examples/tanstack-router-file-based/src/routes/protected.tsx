// NOTE: Absolute imports are possible due to the following configuration:
// - tsconfig.json: "baseUrl": "./src"
// - vite.config.ts: usage of the "vite-tsconfig-paths" plugin
import { prOidc, useOidc } from "oidc";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/protected")({
    component: ProtectedPage,
    loader: protectedRouteLoader
});

function ProtectedPage() {
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

async function protectedRouteLoader() {
    const oidc = await prOidc;

    if (oidc.isUserLoggedIn) {
        return null;
    }

    await oidc.login({
        doesCurrentHrefRequiresAuth: true
    });
}
