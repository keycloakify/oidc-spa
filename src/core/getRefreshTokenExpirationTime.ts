import { assert } from "../tools/tsafe/assert";
import { INFINITY_TIME } from "../tools/INFINITY_TIME";
import { readExpirationTimeInJwt } from "../tools/readExpirationTimeInJwt";

export function getRefreshTokenExpirationTime(params: {
    refreshToken: string | undefined;
    tokenResponse: Record<string, unknown>;
    issuedAtTime: number;
}): number | undefined {
    const { refreshToken, tokenResponse, issuedAtTime } = params;

    if (refreshToken === undefined) {
        return undefined;
    }

    for (const propertyName of ["refresh_expires_at", "refresh_token_expires_at"] as const) {
        const expiresAt = tokenResponse[propertyName];

        if (expiresAt === undefined) {
            continue;
        }

        assert(typeof expiresAt === "number", "2033392");

        if (expiresAt === 0) {
            return INFINITY_TIME;
        }

        return expiresAt * 1000;
    }

    for (const propertyName of ["refresh_expires_in", "refresh_token_expires_in"] as const) {
        const expiresIn = tokenResponse[propertyName];

        if (expiresIn === undefined) {
            continue;
        }

        assert(typeof expiresIn === "number", "2033425330");

        if (expiresIn === 0) {
            return INFINITY_TIME;
        }

        return issuedAtTime + expiresIn * 1000;
    }

    return readExpirationTimeInJwt(refreshToken);
}
