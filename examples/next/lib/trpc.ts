"use client";

import { createTRPCClient, httpBatchLink } from "@trpc/client";
import type { AppRouter } from "./server/trpc";
import { getOidc } from "./oidc";

export const trpc = createTRPCClient<AppRouter>({
    links: [
        httpBatchLink({
            url: `${process.env.__NEXT_ROUTER_BASEPATH}/api/trpc`,
            headers: async () => {
                const oidc = await getOidc({ assert: "user logged in" });
                return { Authorization: `Bearer ${await oidc.getAccessToken()}` };
            }
        })
    ]
});
