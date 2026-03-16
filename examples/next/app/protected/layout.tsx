"use client";

import { PropsWithChildren } from "react";
import { withLoginEnforced } from "@/lib/oidc";

const ProtectedLayout = withLoginEnforced(({ children }: PropsWithChildren) => {
    return children;
});

export default ProtectedLayout;
