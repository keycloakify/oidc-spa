import { createApp } from "vue";
import App from "./App.vue";
import { initializeOidc } from "./oidc";
import { router } from "./router";
import "./styles.css";

await initializeOidc();

const app = createApp(App);
app.use(router);

await router.isReady();
app.mount("#app");
