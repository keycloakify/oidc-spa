import { INFINITY_TIME } from "../tools/INFINITY_TIME";
import { readExpirationTimeInJwt } from "../tools/readExpirationTimeInJwt";
import { toNumber } from "../tools/toNumber";

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
        const expiresAt = toNumber(tokenResponse[propertyName]);

        if (expiresAt === undefined) {
            continue;
        }

        if (expiresAt === 0) {
            return INFINITY_TIME;
        }

        return expiresAt * 1000;
    }

    for (const propertyName of ["refresh_expires_in", "refresh_token_expires_in"] as const) {
        const expiresIn = toNumber(tokenResponse[propertyName]);

        if (expiresIn === undefined) {
            continue;
        }

        if (expiresIn === 0) {
            return INFINITY_TIME;
        }

        return issuedAtTime + expiresIn * 1000;
    }

    return readExpirationTimeInJwt(refreshToken);
}
