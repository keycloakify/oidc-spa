import { createElement, useEffect, useReducer, type ReactNode, type ComponentProps } from "react";
import { useRouter } from "next/navigation";
import type { OidcSpaUtils, Oidc_react, Oidc_client } from "../react-spa";

export function adaptOidcSpaUtils<User, AutoLogin>(
    utils: OidcSpaUtils<User, AutoLogin>
): OidcSpaUtils<User, AutoLogin> {
    const { OidcInitializationGate: OidcInitializationGate_base } = utils;
    const useOidc: () => Oidc_react<User> = utils.useOidc;
    const getOidc: () => Promise<Oidc_client<User>> = utils.getOidc;

    function OidcInitializationGate_inner(props: { children: ReactNode }) {
        const router = useRouter();

        useEffect(() => {
            let isActive = true;

            // getOidc lets initialization errors reach OidcInitializationErrorGate.
            // Calling useOidc here would throw before that gate could render.
            getOidc().then(oidc => {
                if (!isActive) {
                    return;
                }

                if (oidc.authorizationResult !== undefined) {
                    // Early initialization restores the URL outside Next's router.
                    // Synchronize the App Router after returning from the auth server.
                    router.replace(`${location.pathname}${location.search}${location.hash}`, {
                        scroll: false
                    });
                }
            });

            return () => {
                isActive = false;
            };
        }, [router]);

        return props.children;
    }

    const OidcInitializationGate: typeof OidcInitializationGate_base = props =>
        createElement(OidcInitializationGate_base, {
            ...props,
            children: createElement(OidcInitializationGate_inner, {
                children: props.children
            })
        });

    const withLoginEnforced: OidcSpaUtils<User, false>["withLoginEnforced"] = Component => {
        function ComponentWithLoginEnforced(props: ComponentProps<typeof Component>) {
            const { isUserLoggedIn, login } = useOidc();
            const [hasRunEffect, notifyEffectRun] = useReducer(() => true, false);

            useEffect(() => {
                notifyEffectRun();

                if (!isUserLoggedIn) {
                    login({ doesCurrentHrefEnforceLogin: true });
                }
            }, []);

            // App Router navigation must commit before login reads the current URL.
            if (!hasRunEffect || !isUserLoggedIn) {
                return null;
            }

            return createElement(Component, props);
        }

        ComponentWithLoginEnforced.displayName = `${
            Component.displayName ?? Component.name ?? "Component"
        }WithLoginEnforced`;

        return ComponentWithLoginEnforced;
    };

    return { ...utils, OidcInitializationGate, withLoginEnforced };
}
