"use client";

import type { PropsWithChildren } from "react";
import { withLoginEnforced } from "@/lib/oidc";

const ProtectedLayout = withLoginEnforced({
    component: ({ children }: PropsWithChildren) => children,
    pendingComponent: () => null,
    errorComponent: ({ oidcInitializationError }) => (
        <p role="alert">Authentication failed: {oidcInitializationError.toString()}</p>
    )
});

export default ProtectedLayout;
