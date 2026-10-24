import { createOidc } from "oidc-spa/core";
import { createMockOidc } from "oidc-spa/core-mock";
import { createUser, user_mock, type User } from "~/oidc.user";

type AutoLogoutState =
    | { shouldDisplayWarning: false }
    | { shouldDisplayWarning: true; secondsLeftBeforeAutoLogout: number };

export default defineNuxtPlugin({
    name: "oidc",
    enforce: "pre",
    async setup(nuxtApp) {
        const {
            public: { oidcIssuerUri: issuerUri, oidcClientId: clientId, oidcUseMock }
        } = useRuntimeConfig();

        const oidc = oidcUseMock
            ? await createMockOidc({
                  isUserInitiallyLoggedIn: true,
                  issuerUri_mock: issuerUri,
                  clientId_mock: clientId,
                  user_mock,
                  BASE_URL: "/"
              })
            : await createOidc({
                  issuerUri,
                  clientId,
                  autoLogin: false,
                  debugLogs: true,
                  BASE_URL: "/",
                  createUser
              });

        // One subscription per application. Preserve the user object as provided by core.
        const user = shallowRef<User>();
        const autoLogoutState = shallowRef<AutoLogoutState>({ shouldDisplayWarning: false });

        if (oidc.isUserLoggedIn) {
            // Resolve the initial user before mounting components or running route middleware.
            const result = await oidc.getUser();
            user.value = result.user;

            const { unsubscribeFromUserChange } = result.subscribeToUserChange(({ user: next }) => {
                user.value = next;
            });
            const { unsubscribeFromAutoLogoutCountdown } = oidc.subscribeToAutoLogoutCountdown(
                ({ secondsLeft }) => {
                    autoLogoutState.value =
                        secondsLeft === undefined || secondsLeft > 60
                            ? { shouldDisplayWarning: false }
                            : { shouldDisplayWarning: true, secondsLeftBeforeAutoLogout: secondsLeft };
                }
            );

            nuxtApp.vueApp.onUnmount(() => {
                unsubscribeFromUserChange();
                unsubscribeFromAutoLogoutCountdown();
            });
        }

        return {
            provide: {
                oidc,
                oidcUser: shallowReadonly(user),
                oidcAutoLogoutState: shallowReadonly(autoLogoutState)
            }
        };
    }
});
