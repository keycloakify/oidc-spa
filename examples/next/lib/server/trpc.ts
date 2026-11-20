import "server-only";
import { initTRPC, TRPCError } from "@trpc/server";
import { z } from "zod";
import { AuthError, getUser as getUser_generic } from "./oidc";
import { getTodosStore, type TodoItem } from "./data/todos";

const t = initTRPC.context<{ req: Request }>().create();

async function getUser(req: Request) {
    try {
        return await getUser_generic(req);
    } catch (error) {
        if (!(error instanceof AuthError)) throw error;

        const code = {
            400: "BAD_REQUEST",
            401: "UNAUTHORIZED",
            500: "INTERNAL_SERVER_ERROR",
            503: "SERVICE_UNAVAILABLE"
        } as const;

        throw new TRPCError({ code: code[error.status], message: error.message, cause: error });
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
            const userId = user.id;
            const todos = await store.readTodos({ userId });
            const todo: TodoItem = { id: Date.now(), name: input };
            await store.updateTodos({ userId, todos: [...todos, todo] });
        }),
        listAllUserTodos: t.procedure.query(async ({ ctx: { req } }) => {
            const user = await getUser(req);
            if (!user.isAdmin) {
                throw new TRPCError({ code: "FORBIDDEN" });
            }
            return getTodosStore().readAllTodos();
        }),
        delete: t.procedure
            .input(z.object({ userId: z.string().min(1), todoId: z.number().int() }))
            .mutation(async ({ ctx: { req }, input }) => {
                const user = await getUser(req);
                if (!user.isAdmin) {
                    throw new TRPCError({ code: "FORBIDDEN" });
                }
                const store = getTodosStore();
                const userTodos = (await store.readAllTodos()).find(
                    ({ userId }) => userId === input.userId
                );
                if (userTodos === undefined) {
                    throw new TRPCError({ code: "NOT_FOUND", message: "User not found." });
                }
                await store.updateTodos({
                    userId: input.userId,
                    todos: userTodos.todos.filter(todo => todo.id !== input.todoId)
                });
            })
    })
});

export type AppRouter = typeof appRouter;
