import { derived, writable, type Readable } from 'svelte/store';

export const useReducer = <T, R = void>(
  reducer: (state: T, action: R) => T,
  initialState: T,
): [Readable<T>, (action: R) => void] => {
  const state = writable(initialState);
  const dispatch = (action: R) => state.update((currentState) => reducer(currentState, action));
  const readableState = derived(state, ($state) => $state);
  return [readableState, dispatch];
};
