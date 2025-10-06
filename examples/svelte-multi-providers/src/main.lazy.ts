import { mount } from "svelte";
import "./app.css";
import App from "./App.svelte";

const appElement = document.getElementById("app");
if (!appElement) {
    throw new Error("Could not find #app element");
}

const app = mount(App, { target: appElement });

export default app;
