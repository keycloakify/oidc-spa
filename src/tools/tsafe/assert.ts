export type { Equals } from "./Equals";

/** https://docs.tsafe.dev/assert#error-thrown */
export class AssertionError extends Error {
    originalMessage?: string;

    constructor(msg: string | undefined) {
        super(`Wrong assert${!msg ? "" : `: "${msg}"`}`);

        this.originalMessage = msg;

        Object.setPrototypeOf(this, new.target.prototype);

        if (!this.stack) {
            return;
        }
    }
}

let refOfIs: undefined | Record<string, never> = undefined;

/** https://docs.tsafe.dev/assert */
export function assert<_T extends true>(
    condition?: any,
    msg?: string | (() => string)
): asserts condition {
    if (arguments.length === 0) {
        condition = true;
    }
    if (refOfIs) {
        refOfIs = undefined;
        return;
    }

    if (!condition) {
        const error = new AssertionError(typeof msg === "function" ? msg() : msg);

        if (Error.captureStackTrace) {
            Error.captureStackTrace(error, assert);
        }

        throw error;
    }
}

const errorMessage = "'is' error";

/** https://docs.tsafe.dev/is */
export function is<T>(_value: any): _value is T {
    const ref = {};

    if (refOfIs) {
        refOfIs = undefined;
        throw new Error(errorMessage);
    }

    refOfIs = ref;

    Promise.resolve().then(() => {
        if (refOfIs === ref) {
            throw new Error(errorMessage);
        }
    });

    return null as any;
}
