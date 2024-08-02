export type ValueOrPromiseOrAsyncGetter<T> = T | Promise<T> | (() => Promise<T>);
