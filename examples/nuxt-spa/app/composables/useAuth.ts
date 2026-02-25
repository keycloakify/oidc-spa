export function useAuth() {
    const { $oidc } = useNuxtApp();

    const isAuthenticated = computed(() => {
        return $oidc.isUserLoggedIn;
    });

    const idToken = computed(() => {
        if (!$oidc.isUserLoggedIn) {
            return null;
        }

        return $oidc.getDecodedIdToken();
    });

    function login() {
        if (!$oidc.isUserLoggedIn) {
            return $oidc.login({
                doesCurrentHrefRequiresAuth: false
            });
        }
    }

    function logout() {
        if ($oidc.isUserLoggedIn) {
            return $oidc.logout({ redirectTo: "home" });
        }
    }

    return {
        isAuthenticated,
        idToken,
        login,
        logout
    };
}
