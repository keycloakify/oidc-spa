import { oidcSpa } from "oidc-spa/client";
import { z } from "zod";
import { decodeJwt } from "oidc-spa/decode-jwt";
import avatarFallbackSvgUrl from "./assets/userPictureFallback.svg";
import { computed, shallowRef, shallowReadonly } from "vue";
import type { Oidc, AutoLogoutState } from "oidc-spa/client";
import { assert } from "tsafe";

// App-specific user model exposed by `useUser()`.
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
        const autoLogout_returnToUrl = () =>
            `/inactivity-logout?return_url=${encodeURIComponent(location.href)}`;

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

let oidc: Oidc<User_client> | undefined = undefined;
const userRef = shallowRef<User_client>();
const autoLogoutStateRef = shallowRef<AutoLogoutState>({ shouldDisplayWarning: false });

// Called once before installing the router and mounting Vue.
export async function initializeOidc(): Promise<void> {
    oidc = await getOidc();

    if (oidc.isUserLoggedIn) {
        userRef.value = await oidc.getUser();

        oidc.subscribeToUserChange(({ user }) => {
            userRef.value = user;
        });

        oidc.subscribeToAutoLogoutState(state => {
            autoLogoutStateRef.value = state;
        });
    }
}

export function getOidcSync(): Oidc<User_client> {
    assert(oidc !== undefined, "Await initializeOidc() before calling getOidcSync().");
    return oidc;
}

// Read the computed ref only when logged in.
export function useUser() {
    return computed(() => {
        const user = userRef.value;

        assert(
            user !== undefined,
            "Await initializeOidc() and make sure the user is logged in before reading useUser()."
        );

        return user;
    });
}

export function useAutoLogoutState() {
    return shallowReadonly(autoLogoutStateRef);
}

// NOTE: Expect the toHref to be a fully qualified href
export async function enforceLogin(toHref: string): Promise<void> {
    const oidc = await getOidc();

    if (!oidc.isUserLoggedIn) {
        if (oidc.initializationError !== undefined) {
            throw oidc.initializationError;
        }

        await oidc.login({
            returnToUrl: toHref,
            doesCurrentHrefEnforceLogin: toHref.replace(/\/$/, "") === location.href.replace(/\/$/, "")
        });
        // NOTE: Never Here
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
