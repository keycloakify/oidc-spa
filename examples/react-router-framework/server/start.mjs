import express from "express";
import { resolve } from "node:path";
import app from "../build/server/app.mjs";

const clientDir = resolve("build/client");
app.use(express.static(clientDir));
app.get("/{*path}", (_req, res) => {
    res.setHeader("Cache-Control", "no-cache");
    res.sendFile("index.html", { root: clientDir });
});

const port = Number(process.env.PORT || 3000);
app.listen(port, () => console.log(`App listening on http://localhost:${port}`));
