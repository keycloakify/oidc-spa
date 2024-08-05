export type ValueOrAsyncGetter<T> = T | (() => Promise<T>);
