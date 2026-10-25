import express, { type ErrorRequestHandler } from "express";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { appRouter } from "./trpc";
import { createApiRouter } from "./api";
import { AuthError } from "./oidc";

const app = express();
app.disable("x-powered-by");
app.use("/api", (_req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    next();
});
app.use(express.json({ limit: "16kb" }));
app.use(
    "/api/trpc",
    createExpressMiddleware({
        router: appRouter,
        createContext: ({ req }) => ({ req })
    })
);
app.use("/api", createApiRouter());
app.use("/api", (_req, res) => {
    res.status(404).json({ error: "API endpoint not found." });
});

const handleError: ErrorRequestHandler = (error, _req, res, _next) => {
    if (error instanceof AuthError) {
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
app.use(handleError);

export default app;
