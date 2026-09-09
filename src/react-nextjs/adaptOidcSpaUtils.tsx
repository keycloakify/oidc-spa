import { useEffect, useReducer, type ReactNode, type ComponentProps } from "react";
import { useRouter } from "next/navigation";
import type { OidcSpaUtils as OidcSpaUtils_react, UseOidc } from "../react-spa";
import type { OidcSpaUtils } from "./types";

export function adaptOidcSpaUtils<User, AutoLogin>(
    utils: OidcSpaUtils_react<User, AutoLogin>
): OidcSpaUtils<User, AutoLogin> {
    const { OidcInitializationGate: OidcInitializationGate_base } = utils;
    const useOidc: () => UseOidc.Oidc<User> = utils.useOidc;

    function OidcInitializationGate_inner(props: { children: ReactNode }) {
        const { backFromAuthServer } = useOidc();
        const router = useRouter();

        useEffect(() => {
            if (backFromAuthServer !== undefined) {
                // Early initialization restores the URL outside Next's router.
                // Synchronize the App Router after returning from the auth server.
                router.replace(`${location.pathname}${location.search}${location.hash}`, {
                    scroll: false
                });
            }
        }, [backFromAuthServer, router]);

        return props.children;
    }

    const OidcInitializationGate: typeof OidcInitializationGate_base = props => (
        <OidcInitializationGate_base {...props}>
            <OidcInitializationGate_inner>{props.children}</OidcInitializationGate_inner>
        </OidcInitializationGate_base>
    );

    const withLoginEnforced: OidcSpaUtils_react<User, false>["withLoginEnforced"] = Component => {
        function ComponentWithLoginEnforced(props: ComponentProps<typeof Component>) {
            const { isUserLoggedIn, login } = useOidc();
            const [hasRunEffect, notifyEffectRun] = useReducer(() => true, false);

            useEffect(() => {
                notifyEffectRun();

                if (!isUserLoggedIn) {
                    login({ doesCurrentHrefRequiresAuth: true });
                }
            }, [isUserLoggedIn, login]);

            // App Router navigation must commit before login reads the current URL.
            if (!hasRunEffect || !isUserLoggedIn) {
                return null;
            }

            return <Component {...props} />;
        }

        ComponentWithLoginEnforced.displayName = `${
            Component.displayName ?? Component.name ?? "Component"
        }WithLoginEnforced`;

        return ComponentWithLoginEnforced;
    };

    return { ...utils, OidcInitializationGate, withLoginEnforced };
}
