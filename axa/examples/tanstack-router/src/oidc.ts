import { OidcClient, type OidcConfiguration } from "@axa-fr/react-oidc";

export const oidcConfiguration: OidcConfiguration = {
    authority: import.meta.env.VITE_KEYCLOAK_ISSUER_URI,
    client_id: import.meta.env.VITE_KEYCLOAK_CLIENT_ID,
    redirect_uri: `${window.location.origin}/authentication/callback`,
    silent_redirect_uri: `${window.location.origin}/authentication/silent-callback`,
    silent_login_uri: `${window.location.origin}/authentication/silent-login`,
    scope: "openid profile email",
    // The demo realm issues short-lived tokens; AXA's default is 120 seconds.
    refresh_time_before_tokens_expiration_in_second: 5,
    monitor_session: true,
    service_worker_relative_url: "/OidcServiceWorker.js",
    service_worker_only: true
};

// OidcProvider restores the session before mounting RouterProvider. Its callback
// routes also run before TanStack Router, so they need no file-based routes.
export const getOidc = () => OidcClient.getOrThrow();

export async function enforceLogin(returnTo: string): Promise<void> {
    const oidc = getOidc();
    if (oidc.tokens) return;

    if (!oidc.isLoggingOut) await oidc.loginAsync(returnTo);

    // loginAsync schedules a browser navigation. Keep child loaders from running
    // without authentication while that navigation is pending.
    await new Promise<never>(() => {});
}

// AXA handles renewal and sends a token placeholder to the worker. The worker
// substitutes the real token for allowlisted API URLs.
export const fetchWithAuth: typeof fetch = (input, init) =>
    getOidc().fetchWithTokens(window.fetch.bind(window))(input, init);

export const keycloakAccountUrl = new URL(`${oidcConfiguration.authority}/account`);
keycloakAccountUrl.searchParams.set("referrer", oidcConfiguration.client_id);
keycloakAccountUrl.searchParams.set("referrer_uri", `${window.location.origin}/account`);
