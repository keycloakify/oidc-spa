<script lang="ts">
    import { OidcInitializationError } from "oidc-spa";
    import type { Snippet } from "svelte";
    import { initializeOidc } from "../oidc";

    const {
        microsoft,
        children
    }: { microsoft: ReturnType<typeof initializeOidc>["microsoft"]; children: Snippet } = $props();

    const microsoftProps = microsoft.props;
    const oidcOrInitializationError = $derived($microsoftProps.oidcOrInitializationError);
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
    <microsoft.OidcContextProvider {oidc} setOidcContext={microsoft.setOidcContext}>
        {@render children()}
    </microsoft.OidcContextProvider>
{/if}
