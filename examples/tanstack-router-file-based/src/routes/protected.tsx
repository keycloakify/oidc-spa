// NOTE: Absolute imports are possible due to the following configuration:
// - tsconfig.json: "baseUrl": "./src"
// - vite.config.ts: usage of the "vite-tsconfig-paths" plugin
import { getOidc, useOidc } from "oidc";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/protected")({
    component: ProtectedPage,
    beforeLoad: async () => {
        const oidc = await getOidc();

        if (oidc.isUserLoggedIn) {
            return;
        }

        await oidc.login({
            doesCurrentHrefRequiresAuth: true
        });
    }
});

function ProtectedPage() {
    // Here we can safely assume that the user is logged in.
    const { oidcTokens, goToAuthServer, backFromAuthServer, renewTokens } = useOidc({
        assert: "user logged in"
    });

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
            {backFromAuthServer?.extraQueryParams.kc_action === "UPDATE_PASSWORD" && (
                <p>Result: {backFromAuthServer.result.kc_action_status}</p>
            )}
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
            {backFromAuthServer?.extraQueryParams.kc_action === "UPDATE_PROFILE" && (
                <p>Result: {backFromAuthServer.result.kc_action_status}</p>
            )}
            <br />
            <br />
            <button
                onClick={() =>
                    goToAuthServer({
                        extraQueryParams: { kc_action: "delete_account" }
                    })
                }
            >
                Delete account
            </button>
            <br />
            <br />
            <button onClick={() => renewTokens()}>Renew tokens</button>
        </h4>
    );
}
