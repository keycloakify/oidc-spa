import type { IncomingMessage, ServerResponse } from "node:http";
import { config } from "dotenv";
import { app } from "../server/app.js";

// Load the committed demo defaults, preserving values configured in Vercel.
config({ path: new URL("../.env", import.meta.url), override: false, quiet: true });

// Vercel owns the HTTP server; this function forwards each request to Express.
export default function requestHandler(req: IncomingMessage, res: ServerResponse) {
    app(req, res);
}
