export type ValueOrAsyncGetter<T> = T | (() => Promise<T>);
export type ValueOrGetter<T> = T | (() => T);
