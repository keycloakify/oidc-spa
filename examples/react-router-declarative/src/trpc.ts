import { createTRPCClient, httpBatchLink } from "@trpc/client";
import type { AppRouter } from "../server/trpc";
import { getOidc } from "./oidc";

export const trpc = createTRPCClient<AppRouter>({
    links: [
        httpBatchLink({
            url: "/api/trpc",
            headers: async () => {
                const oidc = await getOidc();

                return {
                    Authorization: oidc.isUserLoggedIn
                        ? `Bearer ${await oidc.getAccessToken()}`
                        : undefined
                };
            }
        })
    ]
});
