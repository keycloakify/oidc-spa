import { type ComponentType, type FC, useEffect } from "react";
import { getOidcRequiredPostHydrationReplaceNavigationUrl } from "../../core/requiredPostHydrationReplaceNavigationUrl";
import { useRouter } from "@tanstack/react-router";

export function withHandlingOidcPostLoginNavigation<Props extends Record<string, unknown>>(
    Component: ComponentType<Props>
): FC<Props> {
    let { rootRelativeRedirectUrl } = getOidcRequiredPostHydrationReplaceNavigationUrl();

    if (rootRelativeRedirectUrl === undefined) {
        // @ts-expect-error
        return Component;
    }

    function ComponentWithHandlingOidcPostLoginNavigation(props: Props) {
        const router = useRouter();

        useEffect(() => {
            if (rootRelativeRedirectUrl === undefined) {
                return;
            }

            // Defer navigation to the next paint to avoid hydration mismatches.
            // A double rAF schedules after hydration/paint without arbitrary timeouts.
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    if (rootRelativeRedirectUrl !== undefined) {
                        router.navigate({
                            to: rootRelativeRedirectUrl,
                            replace: true
                        });
                        rootRelativeRedirectUrl = undefined;
                    }
                });
            });
        }, []);

        return <Component {...props} />;
    }

    ComponentWithHandlingOidcPostLoginNavigation.displayName = `${
        Component.displayName ?? Component.name ?? "Component"
    }WithHandlingOidcPostLoginNavigation`;

    return ComponentWithHandlingOidcPostLoginNavigation;
}
