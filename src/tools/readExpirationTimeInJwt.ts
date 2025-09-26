import { decodeJwt } from "./decodeJwt";
import { assert } from "../vendor/frontend/tsafe";

// Return undefined if token provided wasn't a JWT or if it hasn't an exp claim number
export function readExpirationTimeInJwt(token: string): number | undefined {
    let exp: number;

    try {
        exp = decodeJwt<{ exp: number }>(token).exp;
        assert(typeof exp === "number");
    } catch {
        return undefined;
    }

    if (exp === 0) {
        return Number.POSITIVE_INFINITY;
    }

    return exp * 1000;
}
