import { oidcSpa } from "oidc-spa/framework-agnostic";
import { z } from "zod";
import { decodeJwt } from "oidc-spa/decode-jwt";
import avatarFallbackSvgUrl from "./assets/userPictureFallback.svg";
import { shallowRef, shallowReadonly } from "vue";
import type { Oidc } from "oidc-spa/framework-agnostic";

// App-specific user model exposed by `useOidc()`.
// Shape it around the information the UI needs to render.
export type User_client = {
    displayName: string;
    email: string | undefined;
    avatarImgUrl: string;
    canSeeAdminNavigation: boolean;
};

export const { getOidc } = oidcSpa
    .withUser<User_client>(async ({ isMock, idTokenClaims, accessToken }) => {
        if (isMock) {
            const user_mock: User_client = {
                displayName: "John Doe",
                email: "john.doe@gmail.com",
                avatarImgUrl: avatarFallbackSvgUrl,
                canSeeAdminNavigation: true
            };
            return user_mock;
        }

        const { name, picture, email } = z
            .object({
                name: z.string(),
                picture: z.string().optional(),
                email: z.string().optional()
            })
            .parse(idTokenClaims);

        const { roles } = z
            .object({
                roles: z.array(z.string()).optional()
            })
            .parse(decodeJwt(accessToken));

        const user: User_client = {
            displayName: name,
            avatarImgUrl: picture || avatarFallbackSvgUrl,
            email,
            canSeeAdminNavigation: roles?.includes("admin") ?? false
        };

        return user;
    })
    .withRuntimeConfigs(async () => {
        const autoLogout_returnToUrl = () => {
            const url = new URL(`${import.meta.env.BASE_URL}inactivity-logout`, window.location.origin);
            url.searchParams.set("return_url", window.location.href);
            return url.href;
        };

        switch (import.meta.env.VITE_OIDC_PROVIDER) {
            case "mock":
                return {
                    mode: "mock",
                    isUserInitiallyLoggedIn: true
                };
            case "Keycloak":
                return {
                    mode: "real",
                    issuerUri: import.meta.env.VITE_KEYCLOAK_ISSUER_URI!,
                    clientId: import.meta.env.VITE_KEYCLOAK_CLIENT_ID!,
                    autoLogout_returnToUrl,
                    debugLogs: true
                };
            case "Keycloak2":
                return {
                    mode: "real",
                    issuerUri: import.meta.env.VITE_KEYCLOAK2_ISSUER_URI!,
                    clientId: import.meta.env.VITE_KEYCLOAK2_CLIENT_ID!,
                    autoLogout_returnToUrl,
                    debugLogs: true
                };
            case "Auth0":
                return {
                    mode: "real",
                    issuerUri: import.meta.env.VITE_AUTH0_ISSUER_URI!,
                    clientId: import.meta.env.VITE_AUTH0_CLIENT_ID!,
                    autoLogout_returnToUrl,
                    authorizationParams: {
                        audience: import.meta.env.VITE_AUTH0_API_IDENTIFIER!
                    },
                    idleSessionLifetimeInSeconds: parseInt(
                        import.meta.env.VITE_AUTH0_SSO_SESSION_IDLE_SECONDS!
                    ),
                    // DPoP is only available for paying Auth0 customer.
                    disableDPoP: true,
                    debugLogs: true
                };
            case "EntraID":
                return {
                    mode: "real",
                    issuerUri: import.meta.env.VITE_ENTRA_ISSUER_URI!,
                    clientId: import.meta.env.VITE_ENTRA_CLIENT_ID!,
                    autoLogout_returnToUrl,
                    scopes: ["profile", import.meta.env.VITE_ENTRA_API_SCOPE!],
                    debugLogs: true
                };
            default:
                throw new Error("Unknown provider");
        }
    })
    .createUtils();

// Everything below is example-local Vue glue. The adapter itself only exposes getOidc().
type AutoLogoutState = Parameters<Parameters<Oidc.LoggedIn["subscribeToAutoLogoutState"]>[0]>[0];

const oidcState = shallowRef<Oidc<User_client>>();
const userState = shallowRef<User_client>();
const autoLogoutState = shallowRef<AutoLogoutState>({ shouldDisplayWarning: false });

// Called once before installing the router and mounting Vue.
export async function initializeOidc(): Promise<void> {
    const oidc = await getOidc();
    oidcState.value = oidc;

    if (oidc.isUserLoggedIn) {
        oidc.subscribeToUserChange(({ user }) => {
            userState.value = user;
        });
        oidc.subscribeToAutoLogoutState(state => {
            autoLogoutState.value = state;
        });

        // Subscribe before the first read to observe both initial creation and refreshes.
        userState.value = await oidc.getUser();
    }
}

export function useOidc() {
    return {
        oidc: shallowReadonly(oidcState),
        user: shallowReadonly(userState),
        autoLogoutState: shallowReadonly(autoLogoutState)
    };
}

// Vue Router supplies the target href, including the application's base path.
export async function enforceLogin(targetHref: string): Promise<void> {
    const oidc = await getOidc();

    if (oidc.initializationError !== undefined) {
        throw oidc.initializationError;
    }

    if (!oidc.isUserLoggedIn) {
        const returnToUrl = new URL(targetHref, window.location.origin).href;
        await oidc.login({
            returnToUrl,
            doesCurrentHrefEnforceLogin: returnToUrl === window.location.href
        });
    }
}

// Attaches the access token when logged in; otherwise behaves like fetch.
export const fetchWithAuth: typeof fetch = async (input, init) => {
    const request = new Request(input, init);
    const oidc = await getOidc();

    if (oidc.isUserLoggedIn) {
        request.headers.set("Authorization", `Bearer ${await oidc.getAccessToken()}`);
    }

    return fetch(request);
};
