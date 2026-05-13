import { assert } from "./tsafe/assert";

export function toNumber(v: unknown): number | undefined {
    if (v === undefined || v === null) {
        return undefined;
    }

    if (typeof v === "string") {
        const v_n = parseFloat(v);

        assert(!isNaN(v_n), `3922033 ${v}`);

        return v_n;
    }

    assert(typeof v === "number", `2932202 ${v}`);

    return v;
}
