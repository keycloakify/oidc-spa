import type { MaybeAsync } from "./MaybeAsync";

export type GetterOrDirectValue<P, T> = ((params: P) => T) | T;

export type OptionallyAsyncGetterOrDirectValue<P, T> = ((params: P) => MaybeAsync<T>) | T;
