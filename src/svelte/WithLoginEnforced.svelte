<script lang="ts">
  import { assert } from '../vendor/frontend/tsafe';
  import { getContext, onMount } from 'svelte';
  import { oidcContextKey } from './oidc.context';
  import type { OidcSvelte } from './svelte';
  import type { WithLoginEnforcedProps } from './WithLoginEnforced';

  const { params, children }: WithLoginEnforcedProps = $props();
  const contextValue = getContext<OidcSvelte.Context<Record<string, unknown>>>(oidcContextKey);

  assert(contextValue !== undefined);

  const { oidc, fallback: Fallback } = contextValue;

  onMount(() => {
    const unsubscribe = oidc.subscribe((o) => {
      if (o.isUserLoggedIn) {
        return;
      }

      o.login({ doesCurrentHrefRequiresAuth: true });
    });

    return () => unsubscribe();
  });
</script>

{#if !$oidc.isUserLoggedIn}
  {#if params?.OnRedirecting === undefined}
    <Fallback></Fallback>
  {:else}
    <params.OnRedirecting />
  {/if}
{:else}
  {@render children?.()}
{/if}
