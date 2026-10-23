import "server-only";
import { initTRPC, TRPCError } from "@trpc/server";
import { z } from "zod";
import { getUser } from "./auth";
import { getTodosStore, type TodoItem } from "./data/todos";

const t = initTRPC.context<{ req: Request }>().create();

export const appRouter = t.router({
    todos: t.router({
        list: t.procedure.query(async ({ ctx }) => {
            const user = await getUser(ctx);
            return getTodosStore().readTodos({ userId: user.id });
        }),
        add: t.procedure.input(z.string().trim().min(1)).mutation(async ({ ctx, input }) => {
            const user = await getUser(ctx);
            const store = getTodosStore();
            const userId = user.id;
            const todos = await store.readTodos({ userId });
            const todo: TodoItem = { id: Date.now(), name: input };
            await store.updateTodos({ userId, todos: [...todos, todo] });
        }),
        listAllUserTodos: t.procedure.query(async ({ ctx }) => {
            const user = await getUser(ctx);
            if (!user.isAdmin) {
                throw new TRPCError({ code: "FORBIDDEN" });
            }
            return getTodosStore().readAllTodos();
        }),
        delete: t.procedure
            .input(z.object({ userId: z.string().min(1), todoId: z.number().int() }))
            .mutation(async ({ ctx, input }) => {
                const user = await getUser(ctx);
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
