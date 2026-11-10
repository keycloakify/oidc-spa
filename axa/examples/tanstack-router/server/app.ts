import express, { type ErrorRequestHandler } from "express";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { z } from "zod";
import { appRouter } from "./trpc";
import { getUser, HttpError } from "./oidc";
import { getTodosStore, type TodoItem } from "./data/todos";

export const app = express();
app.disable("x-powered-by");

const api = express.Router();
api.use((_req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    next();
});

api.use(
    "/trpc",
    createExpressMiddleware({
        router: appRouter,
        createContext: ({ req }) => ({ req })
    })
);

api.use(express.json());

api.get("/todos", async (req, res) => {
    const user = await getUser(req);
    res.json(await getTodosStore().readTodos({ userId: user.id }));
});

api.post("/todos", async (req, res) => {
    const user = await getUser(req);
    const input = z.object({ name: z.string().trim().min(1) }).safeParse(req.body);
    if (!input.success) throw new HttpError(400, "A non-empty todo name is required.");

    const store = getTodosStore();
    const todos = await store.readTodos({ userId: user.id });
    const todo: TodoItem = { id: Date.now(), name: input.data.name };
    await store.updateTodos({ userId: user.id, todos: [...todos, todo] });
    res.status(201).json(todo);
});

api.use((_req, res) => {
    res.status(404).json({ error: "API endpoint not found." });
});

const handleError: ErrorRequestHandler = (error, _req, res, _next) => {
    if (error instanceof HttpError) {
        res.status(error.status).json({ error: error.message });
        return;
    }
    if (error?.type === "entity.parse.failed" || error?.type === "entity.too.large") {
        res.status(error.status).json({ error: "Invalid JSON request body." });
        return;
    }
    console.error(error);
    res.status(500).json({ error: "An unexpected server error occurred." });
};
api.use(handleError);

app.use("/api", api);
