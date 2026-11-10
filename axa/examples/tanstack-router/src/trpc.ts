import { createTRPCClient, httpBatchLink } from "@trpc/client";
import type { AppRouter } from "../server/trpc";
import { fetchWithAuth } from "./oidc";

export const trpc = createTRPCClient<AppRouter>({
    links: [httpBatchLink({ url: "/api/trpc", fetch: fetchWithAuth })]
});
