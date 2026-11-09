import { createElement, useEffect, useReducer, type ReactNode, type ComponentProps } from "react";
import { useRouter } from "next/navigation";
import type { OidcSpaUtils } from "../react-spa";

export function adaptOidcSpaUtils<User>(utils: OidcSpaUtils<User>): OidcSpaUtils<User> {
    const { OidcInitializationGate: OidcInitializationGate_base, getOidc } = utils;

    function OidcInitializationGate_inner(props: { children: ReactNode }) {
        const router = useRouter();

        useEffect(() => {
            let isActive = true;

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

    const withLoginEnforced: OidcSpaUtils<User>["withLoginEnforced"] = params => {
        const Component = utils.withLoginEnforced(params);

        function ComponentWithLoginEnforced(props: ComponentProps<typeof Component>) {
            const [hasRunEffect, notifyEffectRun] = useReducer(() => true, false);

            useEffect(() => {
                notifyEffectRun();
            }, []);

            // App Router navigation must commit before login reads the current URL.
            if (!hasRunEffect) {
                return null;
            }

            return createElement(Component, props);
        }

        ComponentWithLoginEnforced.displayName = `${
            params.component.displayName ?? params.component.name ?? "Component"
        }WithLoginEnforced`;

        return ComponentWithLoginEnforced;
    };

    return { ...utils, OidcInitializationGate, withLoginEnforced };
}
