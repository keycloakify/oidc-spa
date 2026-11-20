import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { appRouter } from "@/lib/server/trpc";

function handler(req: Request) {
    return fetchRequestHandler({
        // Next.js removes basePath from the request URL passed to route handlers.
        endpoint: "/api/trpc",
        req,
        router: appRouter,
        createContext: () => ({ req }),
        responseMeta: () => ({ headers: { "Cache-Control": "private, no-store" } })
    });
}

export { handler as GET, handler as POST };
