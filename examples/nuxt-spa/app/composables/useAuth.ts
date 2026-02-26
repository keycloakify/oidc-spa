import type { Oidc } from "oidc-spa/core";
import type { DecodedIdToken } from "~/schemas/oidc";

type AutoLogoutState =
    | {
          shouldDisplayWarning: false;
      }
    | {
          shouldDisplayWarning: true;
          secondsLeftBeforeAutoLogout: number;
      };

const autoLogoutStateRef = shallowRef<AutoLogoutState>({
    shouldDisplayWarning: false
});

let hasSubscribedToAutoLogout = false;

function ensureAutoLogoutSubscription(oidc: Oidc<DecodedIdToken>) {
    if (hasSubscribedToAutoLogout || !oidc.isUserLoggedIn) {
        return;
    }

    hasSubscribedToAutoLogout = true;

    oidc.subscribeToAutoLogoutCountdown(({ secondsLeft }) => {
        if (secondsLeft === undefined || secondsLeft > 60) {
            autoLogoutStateRef.value = { shouldDisplayWarning: false };
            return;
        }

        autoLogoutStateRef.value = {
            shouldDisplayWarning: true,
            secondsLeftBeforeAutoLogout: secondsLeft
        };
    });
}

export function useAuth() {
    const { $oidc } = useNuxtApp();

    ensureAutoLogoutSubscription($oidc);

    const isAuthenticated = computed(() => {
        return $oidc.isUserLoggedIn;
    });

    const idToken = computed(() => {
        if (!$oidc.isUserLoggedIn) {
            return null;
        }

        return $oidc.getDecodedIdToken();
    });

    const issuerUri = computed(() => $oidc.issuerUri);
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

    async function fetchWithAuth(input: RequestInfo | URL, init?: RequestInit) {
        const headers = new Headers(init?.headers);

        if ($oidc.isUserLoggedIn) {
            const accessToken = (await $oidc.getTokens()).accessToken;
            headers.set("Authorization", `Bearer ${accessToken}`);
        }

        return fetch(input, {
            ...init,
            headers
        });
    }

    return {
        isAuthenticated,
        idToken,
        autoLogoutState: readonly(autoLogoutStateRef),
        issuerUri,
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
