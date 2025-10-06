<script lang="ts">
    import { Router } from "@mateothegreat/svelte5-router";
    import Google from "./components/Google.svelte";
    import Header from "./components/Header.svelte";
    import Microsoft from "./components/Microsoft.svelte";
    import SelectProviderDialog from "./components/SelectProviderDialog.svelte";
    import { initializeOidc } from "./oidc";
    import { routes } from "./routes";

    const { google, microsoft } = initializeOidc();
</script>

<Google {google}>
    <Microsoft {microsoft}>
        <Header></Header>
        <Router {routes}></Router>
        <SelectProviderDialog></SelectProviderDialog>
    </Microsoft>
</Google>
