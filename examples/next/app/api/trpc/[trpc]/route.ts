import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { appRouter } from "@/lib/server/trpc";

export const runtime = "nodejs";

function handler(req: Request) {
    return fetchRequestHandler({
        endpoint: `${process.env.__NEXT_ROUTER_BASEPATH || ""}/api/trpc`,
        req,
        router: appRouter,
        createContext: () => ({ req }),
        responseMeta: () => ({ headers: { "Cache-Control": "private, no-store" } })
    });
}

export { handler as GET, handler as POST };
