"use client";

import { PropsWithChildren } from "react";
import { withLoginEnforced } from "@/lib/oidc";

const AdminOnlyLayout = withLoginEnforced(({ children }: PropsWithChildren) => {
    return children;
});

export default AdminOnlyLayout;
