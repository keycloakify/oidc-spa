<script lang="ts">
  import { OidcInitializationError } from '..';
  import { setContext } from 'svelte';
  import type { OidcProviderProps } from './OidcProviderProps';
  import { oidcContextKey } from './oidc.context';
  import { getOidcStore } from './oidc.store';

  const { Fallback, ErrorFallback, children }: OidcProviderProps = $props();

  const oidcOrInitializationError = getOidcStore();
  setContext(oidcContextKey, { oidc: oidcOrInitializationError, fallback: Fallback });
</script>

{#if $oidcOrInitializationError === undefined}
  {#if Fallback}
    <Fallback />
  {/if}
{:else if $oidcOrInitializationError instanceof OidcInitializationError}
  {@const initializationError = $oidcOrInitializationError}
  {#if ErrorFallback}
    <ErrorFallback {initializationError} />
  {:else}
    <h1 style:color="red">
      An error occurred while initializing the OIDC client:&nbsp;
      {initializationError.message}
    </h1>
  {/if}
{:else}
  {@render children?.()}
{/if}
