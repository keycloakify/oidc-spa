import "dotenv/config";
import express from "express";
import { fileURLToPath } from "node:url";
import { app } from "./app.js";

// Vite proxies /api here during development. The production server also serves the SPA.
const apiOnly = process.argv.includes("--api-only");
if (!apiOnly) {
    const clientDir = fileURLToPath(new URL("../client/", import.meta.url));
    app.use(
        "/assets",
        express.static(fileURLToPath(new URL("../client/assets/", import.meta.url)), {
            maxAge: "1y",
            immutable: true,
            fallthrough: false
        })
    );
    app.use(
        express.static(clientDir, {
            setHeaders: res => res.setHeader("Cache-Control", "no-cache")
        })
    );
    app.get("/{*path}", (_req, res) => {
        res.setHeader("Cache-Control", "no-cache");
        res.sendFile("index.html", { root: clientDir });
    });
}

const port = Number(process.env[apiOnly ? "API_PORT" : "PORT"] || (apiOnly ? 3001 : 3000));
app.listen(port, () => console.log(`Express listening on http://localhost:${port}`));
