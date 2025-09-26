import { decodeJwt } from "./decodeJwt";
import { assert } from "../vendor/frontend/tsafe";
import { INFINITY_TIME } from "./INFINITY_TIME";

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
        return INFINITY_TIME;
    }

    return exp * 1000;
}
