import { derived, writable, type Readable } from 'svelte/store';

export const useState = <T>(initialState: T): [Readable<T>, (newState: T) => void] => {
  const state = writable(initialState);
  const dispatch = (newState: T) => state.set(newState);
  const readableState = derived(state, ($state) => $state);
  return [readableState, dispatch];
};
