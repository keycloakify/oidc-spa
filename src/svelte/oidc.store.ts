import { derived, writable, type Readable } from 'svelte/store';
import type { OidcSvelte } from './svelte';

const oidcStore = writable<OidcSvelte.OidcStore<Record<string, unknown>>>(undefined);

export const getOidcStore = <DecodedIdToken extends Record<string, unknown>>() =>
  derived(oidcStore, ($state) => $state) as Readable<OidcSvelte.OidcStore<DecodedIdToken>>;

export const updateOidcStore = <DecodedIdToken extends Record<string, unknown>>(
  value: OidcSvelte.OidcStore<DecodedIdToken>,
) => {
  oidcStore.set(value);
};
