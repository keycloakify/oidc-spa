import { createRequestListener } from "@react-router/node";
import * as build from "../build/server/index.js";

// Vercel forwards .data and route-discovery requests to React Router.
export default createRequestListener({ build, mode: "production" });
