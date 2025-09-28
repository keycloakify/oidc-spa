/**
 * Creates a proxy that forwards EVERYTHING to the current target.
 * The proxy has a stable identity, and you can update the target at runtime.
 */
export function createLazyObject<T extends object>(getObject: () => T) {
    let object_cache: T | undefined = undefined;

    const getObject_memo = () => (object_cache ??= getObject());

    const handler: ProxyHandler<any> = {
        get(_t, prop, receiver) {
            return Reflect.get(getObject_memo(), prop, receiver);
        },
        set(_t, prop, value, receiver) {
            return Reflect.set(getObject_memo(), prop, value, receiver);
        },
        has(_t, prop) {
            return Reflect.has(getObject_memo(), prop);
        },
        deleteProperty(_t, prop) {
            return Reflect.deleteProperty(getObject_memo(), prop);
        },
        ownKeys(_t) {
            return Reflect.ownKeys(getObject_memo());
        },
        getOwnPropertyDescriptor(_t, prop) {
            return Reflect.getOwnPropertyDescriptor(getObject_memo(), prop);
        },
        defineProperty(_t, prop, descriptor) {
            return Reflect.defineProperty(getObject_memo(), prop, descriptor);
        },
        getPrototypeOf(_t) {
            return Reflect.getPrototypeOf(getObject_memo());
        },
        setPrototypeOf(_t, proto) {
            return Reflect.setPrototypeOf(getObject_memo(), proto);
        },
        isExtensible(_t) {
            return Reflect.isExtensible(getObject_memo());
        },
        preventExtensions(_t) {
            return Reflect.preventExtensions(getObject_memo());
        }
    };

    return new Proxy({}, handler) as T;
}
