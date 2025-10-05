import "./app.css";
import App from "./App.svelte";
import Fallback from "./Fallback.svelte";
import { mountOidc } from "./oidc";

const app = mountOidc(
    App,
    {
        target: document.getElementById("app")!
    },
    { Fallback: Fallback }
);

export default app;
