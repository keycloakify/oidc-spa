"use client";

import { createTRPCClient, httpBatchLink } from "@trpc/client";
import type { AppRouter } from "./server/trpc";
import { fetchWithAuth } from "./oidc";

export const trpc = createTRPCClient<AppRouter>({
    links: [
        httpBatchLink({
            url: `${process.env.__NEXT_ROUTER_BASEPATH || ""}/api/trpc`,
            fetch: (input, init) => fetchWithAuth(input, init)
        })
    ]
});
