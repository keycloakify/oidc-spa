import type { OidcInitializationError } from '..';
import type { Component, Snippet } from 'svelte';

export type OidcProviderProps = {
  Fallback?: Component;
  ErrorFallback?: Component<{ initializationError: OidcInitializationError }>;
  children?: Snippet;
};
