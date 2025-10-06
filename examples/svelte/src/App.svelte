<script lang="ts">
    import { Router } from "@mateothegreat/svelte5-router";
    import { OidcInitializationError } from "oidc-spa";
    import AutoLogoutWarningOverlay from "./components/AutoLogoutWarningOverlay.svelte";
    import Header from "./components/Header.svelte";
    import { initializeOidc, OidcContextProvider } from "./oidc";
    import { routes } from "./routes";

    const { props, setOidcContext } = initializeOidc();
    const oidcOrInitializationError = $derived($props.oidcOrInitializationError);

    const isOidcInitializationError = (
        value: typeof oidcOrInitializationError
    ): value is OidcInitializationError => {
        return value !== undefined && value instanceof OidcInitializationError;
    };
</script>

{#if oidcOrInitializationError === undefined}
    <p>Loading...</p>
{:else if isOidcInitializationError(oidcOrInitializationError)}
    {@const initializationError = oidcOrInitializationError}
    <h1 style:color="red">
        An error occurred while initializing the OIDC client:&nbsp;
        {initializationError.message}
    </h1>
{:else}
    {@const oidc = oidcOrInitializationError}
    <OidcContextProvider {oidc} {setOidcContext}>
        <Header></Header>
        <Router {routes}></Router>
        <AutoLogoutWarningOverlay></AutoLogoutWarningOverlay>
    </OidcContextProvider>
{/if}
