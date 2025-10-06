<script lang="ts">
    import { OidcInitializationError } from "oidc-spa";
    import type { Snippet } from "svelte";
    import { initializeOidc } from "../oidc";

    const {
        google,
        children
    }: { google: ReturnType<typeof initializeOidc>["google"]; children: Snippet } = $props();

    const googleProps = google.props;
    const oidcOrInitializationError = $derived($googleProps.oidcOrInitializationError);
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
    <google.OidcContextProvider {oidc} setOidcContext={google.setOidcContext}>
        {@render children()}
    </google.OidcContextProvider>
{/if}
