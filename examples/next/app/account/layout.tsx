"use client";

import type { PropsWithChildren } from "react";
import { withLoginEnforced } from "@/lib/oidc";

export default withLoginEnforced(({ children }: PropsWithChildren) => children);
