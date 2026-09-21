import "server-only";
import { initTRPC, TRPCError } from "@trpc/server";
import { getUser } from "./auth";
import { todosSchema, todosStore } from "./todos";

const t = initTRPC.context<{ req: Request }>().create();

export const appRouter = t.router({
    todos: t.router({
        list: t.procedure.query(async ({ ctx }) => {
            const user = await getUser(ctx);
            return todosStore.readTodos(user.id);
        }),
        listAllUserTodos: t.procedure.query(async ({ ctx }) => {
            const user = await getUser(ctx);
            if (!user.isKeycloakAdmin) {
                throw new TRPCError({ code: "UNAUTHORIZED" });
            }
            return todosStore.listAllUserTodos();
        }),
        save: t.procedure.input(todosSchema).mutation(async ({ ctx, input }) => {
            const user = await getUser(ctx);
            await todosStore.updateTodos(user.id, input);
            return input;
        })
    })
});
export type AppRouter = typeof appRouter;
