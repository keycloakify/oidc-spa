export type ConcreteClass<T> = T extends abstract new (...args: infer A) => infer R
    ? { new (...args: A): R } & Omit<T, "prototype">
    : never;
