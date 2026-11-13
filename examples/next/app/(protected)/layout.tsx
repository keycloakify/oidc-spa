"use client";

import type { PropsWithChildren } from "react";
import { withLoginEnforced } from "@/lib/oidc";

export default withLoginEnforced({
    component: ({ children }: PropsWithChildren) => children,
    errorComponent: ({ oidcInitializationError }) => (
        <p role="alert">Authentication failed: {oidcInitializationError.message}</p>
    )
});
