import { createKeycloakUtils, isKeycloak } from "oidc-spa/keycloak";

export function useAuth() {
    const { $oidc, $oidcUser, $oidcAutoLogoutState } = useNuxtApp();

    const isAuthenticated = computed(() => {
        return $oidc.isUserLoggedIn;
    });

    const issuerUri = computed(() => $oidc.issuerUri);
    const keycloakUtils = computed(() => {
        if (!isKeycloak({ issuerUri: issuerUri.value })) {
            return undefined;
        }

        return createKeycloakUtils({ issuerUri: issuerUri.value });
    });

    const clientId = computed(() => $oidc.clientId);
    const validRedirectUri = computed(() => $oidc.validRedirectUri);

    const backFromAuthServer = computed(() => {
        if (!$oidc.isUserLoggedIn) {
            return undefined;
        }

        return $oidc.backFromAuthServer;
    });

    function login() {
        if (!$oidc.isUserLoggedIn) {
            return $oidc.login({
                doesCurrentHrefRequiresAuth: false
            });
        }
    }

    function register(transformUrlBeforeRedirect: (url: string) => string) {
        if (!$oidc.isUserLoggedIn) {
            return $oidc.login({
                doesCurrentHrefRequiresAuth: false,
                transformUrlBeforeRedirect
            });
        }
    }

    function logout() {
        if ($oidc.isUserLoggedIn) {
            return $oidc.logout({ redirectTo: "home" });
        }
    }

    function goToAuthServer(params: { extraQueryParams?: Record<string, string | undefined> }) {
        if ($oidc.isUserLoggedIn) {
            return $oidc.goToAuthServer(params);
        }
    }

    async function fetchWithAuth<T>(
        input: Parameters<typeof $fetch<T>>[0],
        init?: Parameters<typeof $fetch<T>>[1]
    ) {
        const headers = new Headers(init?.headers);

        if ($oidc.isUserLoggedIn) {
            const accessToken = await $oidc.getAccessToken();
            headers.set("Authorization", `Bearer ${accessToken}`);
        }

        return $fetch<T>(input, {
            ...init,
            headers
        });
    }

    async function refreshUser() {
        if (!$oidc.isUserLoggedIn) {
            return;
        }

        const { refreshUser } = await $oidc.getUser();
        return refreshUser();
    }

    return {
        isAuthenticated,
        user: $oidcUser,
        refreshUser,
        autoLogoutState: $oidcAutoLogoutState,
        issuerUri,
        keycloakUtils,
        clientId,
        validRedirectUri,
        backFromAuthServer,
        login,
        register,
        logout,
        goToAuthServer,
        fetchWithAuth
    };
}
