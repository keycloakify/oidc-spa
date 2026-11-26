import { initTRPC, TRPCError } from "@trpc/server";
import { z } from "zod";
import { getUser as getUser_generic } from "./oidc";
import { getTodosStore, type TodoItem } from "./data/todos";

const t = initTRPC.context<{ req: Request }>().create();

async function getUser(req: Request) {
    try {
        return await getUser_generic(req);
    } catch (error) {
        if (!(error instanceof Response)) throw error;
        const code = {
            400: "BAD_REQUEST",
            401: "UNAUTHORIZED",
            403: "FORBIDDEN",
            404: "NOT_FOUND",
            500: "INTERNAL_SERVER_ERROR",
            503: "SERVICE_UNAVAILABLE"
        } as const;
        throw new TRPCError({
            code: code[error.status as keyof typeof code] ?? "INTERNAL_SERVER_ERROR",
            message: await error.text(),
            cause: error
        });
    }
}

export const appRouter = t.router({
    todos: t.router({
        list: t.procedure.query(async ({ ctx: { req } }) => {
            const user = await getUser(req);
            return getTodosStore().readTodos({ userId: user.id });
        }),
        add: t.procedure.input(z.string().trim().min(1)).mutation(async ({ ctx: { req }, input }) => {
            const user = await getUser(req);
            const store = getTodosStore();
            const todos = await store.readTodos({ userId: user.id });
            const todo: TodoItem = { id: Date.now(), name: input };
            await store.updateTodos({ userId: user.id, todos: [...todos, todo] });
        })
    })
});

export type AppRouter = typeof appRouter;
