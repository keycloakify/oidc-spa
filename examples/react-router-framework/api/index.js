import { createRequestListener } from "@remix-run/node-fetch-server";
import { fetch } from "../build/server/index.js";

// Vercel preserves the original resource, .data and route-discovery request URLs.
export default createRequestListener(request => fetch(request), { trustProxy: true });
