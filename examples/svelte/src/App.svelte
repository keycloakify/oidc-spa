<script lang="ts">
    import { Router } from "@mateothegreat/svelte5-router";
    import AutoLogoutWarningOverlay from "./components/AutoLogoutWarningOverlay.svelte";
    import Header from "./components/Header.svelte";
    import { routes } from "./routes";
</script>

<Header></Header>
<Router {routes}></Router>
<AutoLogoutWarningOverlay></AutoLogoutWarningOverlay>
