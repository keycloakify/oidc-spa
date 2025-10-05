<script lang="ts" generics="DecodedIdToken extends Record<string, unknown>, AutoLogin extends boolean">
    import { OidcInitializationError } from "..";
    import OidcProviderLogged from "./OidcProviderLogged.svelte";
    import type { OidcProviderProps } from "./OidcProviderProps";

    const {
        App,
        appProps,
        oidcOrInitializationError,
        oidcProps
    }: OidcProviderProps<DecodedIdToken, AutoLogin> = $props();

    const { Fallback, ErrorFallback } = oidcProps ?? {};
</script>

{#if oidcOrInitializationError === undefined}
    {#if Fallback}
        <Fallback></Fallback>
    {/if}
{:else if oidcOrInitializationError instanceof OidcInitializationError}
    {@const initializationError = oidcOrInitializationError}
    {#if ErrorFallback}
       <ErrorFallback {initializationError} />
    {:else}
        <h1 style:color="red">
            An error occurred while initializing the OIDC client:&nbsp;
            {initializationError.message}
        </h1>
    {/if}
{:else}
    <OidcProviderLogged oidc={oidcOrInitializationError}>
        <App {...appProps} />
    </OidcProviderLogged>
{/if}
