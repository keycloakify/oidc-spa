import { assert, is } from "./tsafe/assert";

// Compare plain objects and arrays structurally; other values must share identity.
// Distinct circular structures conservatively count as changed.
export function areDeepEqual(a: unknown, b: unknown): boolean {
    try {
        return areDeepEqual_rec(a, b);
    } catch {
        // Values may be opaque: failed inspection means they cannot be considered equal.
        return false;
    }
}

function areDeepEqual_rec(a: unknown, b: unknown, ancestors = new Set<object>()): boolean {
    if (Object.is(a, b)) {
        return true;
    }

    if (typeof a !== "object" || a === null || typeof b !== "object" || b === null) {
        return false;
    }

    if (Array.isArray(a) !== Array.isArray(b)) {
        return false;
    }

    const prototype = Array.isArray(a) ? Array.prototype : Object.prototype;

    if (Object.getPrototypeOf(a) !== prototype || Object.getPrototypeOf(b) !== prototype) {
        return false;
    }

    if (ancestors.has(a) || ancestors.has(b)) {
        return false;
    }

    assert(is<Record<PropertyKey, unknown>>(a));
    assert(is<Record<PropertyKey, unknown>>(b));

    // Include symbols and array length, including for sparse arrays.
    const keys = Reflect.ownKeys(a);

    if (keys.length !== Reflect.ownKeys(b).length) {
        return false;
    }

    ancestors.add(a);
    ancestors.add(b);

    const areEqual = keys.every(
        key =>
            Object.prototype.hasOwnProperty.call(b, key) && areDeepEqual_rec(a[key], b[key], ancestors)
    );

    ancestors.delete(a);
    ancestors.delete(b);

    return areEqual;
}
