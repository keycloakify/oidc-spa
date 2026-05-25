import { oidcSpa } from "oidc-spa/react-spa";
import { type User, createUser, user_mock } from "./oidc.user";

export const { bootstrapOidc, useOidc, getOidc, enforceLogin, OidcInitializationGate } = oidcSpa
    .withUser<User>({ createUser, user_mock })
    // See: https://docs.oidc-spa.dev/v/v10/features/auto-login#react-spa
    //.withAutoLogin()
    .createUtils();

/**
 * Call this immediately, or after you fetch remote configuration.
 * If you call it more than once, the later calls are ignored.
 */
bootstrapOidc(
    import.meta.env.VITE_OIDC_USE_MOCK === "true"
        ? {
              // Mock mode: no requests are sent to the auth server.
              implementation: "mock",
              isUserInitiallyLoggedIn: true
              // You can also override `user_mock` here.
          }
        : {
              implementation: "real",
              // Configure your OIDC provider in `.env.local`
              issuerUri: import.meta.env.VITE_OIDC_ISSUER_URI,
              clientId: import.meta.env.VITE_OIDC_CLIENT_ID,
              // Enable for detailed initialization and token lifecycle logs.
              debugLogs: false
          }
);
