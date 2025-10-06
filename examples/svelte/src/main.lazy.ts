import "./app.css";
import App from "./App.svelte";
import Fallback from "./Fallback.svelte";
import { mountOidc } from "./oidc";

const appElement = document.getElementById("app");
if (!appElement) {
    throw new Error("Could not find #app element");
}

const app = mountOidc(App, { target: appElement }, { Fallback: Fallback });

export default app;
