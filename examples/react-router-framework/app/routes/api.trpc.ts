import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import type { Route } from "./+types/api.trpc";
import { appRouter } from "~/.server/trpc";

function handle({ request }: Route.LoaderArgs | Route.ActionArgs) {
    return fetchRequestHandler({
        endpoint: "/api/trpc",
        req: request,
        router: appRouter,
        createContext: () => ({ req: request }),
        responseMeta: () => ({ headers: { "Cache-Control": "no-store" } })
    });
}

export const loader = handle;
export const action = handle;
