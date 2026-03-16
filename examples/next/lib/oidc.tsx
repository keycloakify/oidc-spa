"use client";

import { type ComponentType, type ReactNode, useEffect, useReducer } from "react";
import { useRouter } from "next/navigation";
import { oidcSpa } from "oidc-spa/react-spa";
import { z } from "zod";

const decodedIdTokenSchema = z.object({
    sub: z.string(),
    name: z.string(),
    picture: z.string().optional(),
    email: z.string().email().optional(),
    preferred_username: z.string().optional(),
    realm_access: z.object({ roles: z.array(z.string()) }).optional()
});

const {
    bootstrapOidc,
    useOidc,
    getOidc,
    OidcInitializationGate: OidcInitializationGate_base
} = oidcSpa
    .withExpectedDecodedIdTokenShape({
        decodedIdTokenSchema,
        decodedIdToken_mock: {
            sub: "mock-user",
            name: "John Doe",
            preferred_username: "john.doe",
            realm_access: {
                roles: ["realm-admin"]
            }
        }
    })
    .createUtils();

export { useOidc, getOidc };

bootstrapOidc(
    process.env.NEXT_PUBLIC_OIDC_USE_MOCK === "true"
        ? {
              implementation: "mock",
              isUserInitiallyLoggedIn: true
          }
        : {
              implementation: "real",
              issuerUri: process.env.NEXT_PUBLIC_OIDC_ISSUER_URI!,
              clientId: process.env.NEXT_PUBLIC_OIDC_CLIENT_ID!,
              debugLogs: process.env.NODE_ENV === "development"
          }
);

function OidcInitializationGate_inner(props: { children: ReactNode }) {
    const { children } = props;

    const { backFromAuthServer } = useOidc();
    const router = useRouter();

    useEffect(() => {
        if (backFromAuthServer !== undefined) {
            router.replace(`${location.pathname}${location.search}${location.hash}`, { scroll: false });
        }
    }, []);

    return children;
}

export function OidcInitializationGate(props: { fallback?: ReactNode; children: ReactNode }) {
    const { children, fallback } = props;

    return (
        <OidcInitializationGate_base fallback={fallback}>
            <OidcInitializationGate_inner>{children}</OidcInitializationGate_inner>
        </OidcInitializationGate_base>
    );
}

export function withLoginEnforced<Props extends Record<string, unknown>>(
    component: ComponentType<Props>
): (props: Props) => ReactNode {
    const Component = component;

    function ComponentWithLoginEnforced(props: Props) {
        const { isUserLoggedIn, login } = useOidc();

        const [hasRunEffect, notifyEffectRun] = useReducer(() => true, false);

        useEffect(() => {
            notifyEffectRun();

            if (!isUserLoggedIn) {
                login({
                    doesCurrentHrefRequiresAuth: true
                });
            }
        }, []);

        if (!hasRunEffect) {
            return null;
        }

        if (!isUserLoggedIn) {
            return null;
        }

        return <Component {...props} />;
    }

    ComponentWithLoginEnforced.displayName = `${
        Component.displayName ?? Component.name ?? "Component"
    }WithLoginEnforced`;

    return ComponentWithLoginEnforced;
}

export const fetchWithAuth: typeof fetch = async (input, init) => {
    const oidc = await getOidc();

    if (oidc.isUserLoggedIn) {
        const accessToken = await oidc.getAccessToken();
        const headers = new Headers(init?.headers);
        headers.set("Authorization", `Bearer ${accessToken}`);
        (init ??= {}).headers = headers;
    }

    return fetch(input, init);
};
