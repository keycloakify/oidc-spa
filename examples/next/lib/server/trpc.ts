import "server-only";
import { initTRPC } from "@trpc/server";
import { bootstrapAuth, getUser } from "./auth";
import { getTodosStore, todosSchema, type TodosStore } from "./todos";

const t = initTRPC.context<{ req: Request }>().create();

export function createAppRouter(dependencies: { getTodosStore: () => TodosStore }) {
    bootstrapAuth(
        process.env.NEXT_PUBLIC_OIDC_USE_MOCK === "true"
            ? {
                  implementation: "mock",
                  behavior: "use static identity",
                  decodedAccessToken_mock: { sub: "mock-user-id" }
              }
            : {
                  implementation: "real",
                  issuerUri: process.env.NEXT_PUBLIC_OIDC_ISSUER_URI!,
                  expectedAudience: process.env.NEXT_PUBLIC_OIDC_ACCESS_TOKEN_EXPECTED_AUDIENCE!
              }
    );

    return t.router({
        todos: t.router({
            list: t.procedure.query(async ({ ctx }) => {
                const user = await getUser({ req: ctx.req });
                return dependencies.getTodosStore().readTodos(user.id);
            }),
            save: t.procedure.input(todosSchema).mutation(async ({ ctx, input }) => {
                const user = await getUser({ req: ctx.req });
                await dependencies.getTodosStore().updateTodos(user.id, input);
                return input;
            })
        })
    });
}

export const appRouter = createAppRouter({ getTodosStore });
export type AppRouter = typeof appRouter;
