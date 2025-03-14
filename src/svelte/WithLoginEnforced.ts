import type { Component, Snippet } from 'svelte';

export type WithLoginEnforcedProps = {
  children: Snippet;
  params?: {
    OnRedirecting?: Component;
  };
};
