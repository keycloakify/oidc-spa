import "server-only";
import { join } from "node:path";
import { initTRPC, TRPCError } from "@trpc/server";
import { bootstrapAuth, getUser } from "./auth";
import { createNodeFsTodoStore, createRedisTodoStore, todosSchema } from "./todos";

const t = initTRPC.context<{ req: Request }>().create();

export function createAppRouter() {
    bootstrapAuth(
        process.env.NEXT_PUBLIC_OIDC_USE_MOCK === "true"
            ? {
                  implementation: "mock",
                  behavior: "use static identity",
                  decodedAccessToken_mock: {
                      sub: "mock-user-id",
                      resource_access: { "realm-management": { roles: ["realm-admin"] } }
                  }
              }
            : {
                  implementation: "real",
                  issuerUri: process.env.NEXT_PUBLIC_OIDC_ISSUER_URI!,
                  expectedAudience: process.env.NEXT_PUBLIC_OIDC_ACCESS_TOKEN_EXPECTED_AUDIENCE!
              }
    );

    const todosStore = process.env.KV_REST_API_TOKEN
        ? createRedisTodoStore({
              url: process.env.KV_REST_API_URL!,
              token: process.env.KV_REST_API_TOKEN
          })
        : createNodeFsTodoStore(join(process.cwd(), ".todos"));

    return t.router({
        todos: t.router({
            list: t.procedure.query(async ({ ctx }) => {
                const user = await getUser({ req: ctx.req });
                return todosStore.readTodos(user.id);
            }),
            listAllUserTodos: t.procedure.query(async ({ ctx }) => {
                const user = await getUser({ req: ctx.req });
                if (!user.isKeycloakAdmin) {
                    throw new TRPCError({ code: "UNAUTHORIZED" });
                }
                return todosStore.listAllUserTodos();
            }),
            save: t.procedure.input(todosSchema).mutation(async ({ ctx, input }) => {
                const user = await getUser({ req: ctx.req });
                await todosStore.updateTodos(user.id, input);
                return input;
            })
        })
    });
}

export const appRouter = createAppRouter();
export type AppRouter = typeof appRouter;
