// NOTE: Absolute imports are possible due to the following configuration:
// - tsconfig.json: "baseUrl": "./src"
// - vite.config.ts: usage of the "vite-tsconfig-paths" plugin
import { prOidc, useOidc } from "oidc";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/protected")({
    component: ProtectedPage,
    beforeLoad: protectedRouteLoader
});

function ProtectedPage() {
    // Here we can safely assume that the user is logged in.
    const { oidcTokens, goToAuthServer } = useOidc({ assertUserLoggedIn: true });

    return (
        <h4>
            Hello {oidcTokens.decodedIdToken.preferred_username}
            <br />
            The page you are currently viewing can only be accessed when you are authenticated.
            <br />
            <br />
            <button
                onClick={() =>
                    goToAuthServer({
                        extraQueryParams: { kc_action: "UPDATE_PASSWORD" }
                    })
                }
            >
                Change password
            </button>
            <br />
            <br />
            <button
                onClick={() =>
                    goToAuthServer({
                        extraQueryParams: { kc_action: "UPDATE_PROFILE" }
                    })
                }
            >
                Update profile
            </button>
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
