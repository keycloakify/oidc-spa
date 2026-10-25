import { Router } from "express";
import { z } from "zod";
import { getUser } from "./oidc";
import { getTodosStore, type TodoItem } from "./data/todos";

export function createApiRouter() {
    const api = Router();

    api.get("/todos", async (req, res) => {
        const user = await getUser(req);
        res.json(await getTodosStore().readTodos({ userId: user.id }));
    });

    api.post("/todos", async (req, res) => {
        const user = await getUser(req);
        const result = z.object({ name: z.string().trim().min(1) }).safeParse(req.body);
        if (!result.success) {
            res.status(400).json({ error: "A non-empty todo name is required." });
            return;
        }

        const store = getTodosStore();
        const todos = await store.readTodos({ userId: user.id });
        const todo: TodoItem = { id: Date.now(), name: result.data.name };
        await store.updateTodos({ userId: user.id, todos: [...todos, todo] });
        res.status(201).json(todo);
    });

    return api;
}
