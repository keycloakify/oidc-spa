import { assert, isAmong, id, type Equals, is } from "./vendor/backend/tsafe";
import {
    decodeProtectedHeader,
    jwtVerify,
    createLocalJWKSet,
    errors,
    type JWTPayload
} from "./vendor/backend/jose";
import { z } from "./vendor/backend/zod";
import { Evt, throttleTime } from "./vendor/backend/evt";
import type { ZodSchemaLike } from "./tools/ZodSchemaLike";

/**
 * Claims defined by RFC 9068: "JSON Web Token (JWT) Profile for OAuth 2.0 Access Tokens"
 * https://datatracker.ietf.org/doc/html/rfc9068
 *
 * These tokens are intended for consumption by resource servers.
 */
export type DecodedAccessToken_RFC9068 = {
    // --- REQUIRED (MUST) ---
    iss: string; // Issuer Identifier
    sub: string; // Subject Identifier
    aud: string | string[]; // Audience(s)
    exp: number; // Expiration time (seconds since epoch)
    iat: number; // Issued-at time (seconds since epoch)

    // --- RECOMMENDED (SHOULD) ---
    client_id?: string; // OAuth2 Client ID that requested the token
    scope?: string; // Space-separated list of granted scopes
    jti?: string; // Unique JWT ID (for replay detection)

    // --- OPTIONAL / EXTENSION CLAIMS ---
    nbf?: number; // Not-before time (standard JWT claim)
    auth_time?: number; // Time of user authentication (optional)
    cnf?: Record<string, unknown>; // Confirmation (e.g. proof-of-possession)
    [key: string]: unknown; // Allow custom claims (e.g. roles, groups)
};

const zDecodedAccessToken_RFC9068 = (() => {
    type TargetType = DecodedAccessToken_RFC9068;

    const zTargetType = z
        .object({
            iss: z.string(),
            sub: z.string(),
            aud: z.union([z.string(), z.array(z.string())]),
            exp: z.number(),
            iat: z.number(),
            client_id: z.string().optional(),
            scope: z.string().optional(),
            jti: z.string().optional(),
            nbf: z.number().optional(),
            auth_time: z.number().optional(),
            cnf: z.record(z.unknown()).optional()
        })
        .catchall(z.unknown());

    type InferredType = z.infer<typeof zTargetType>;

    assert<Equals<TargetType, InferredType>>;

    return id<z.ZodType<TargetType>>(zTargetType);
})();

export type ParamsOfCreateOidcBackend<DecodedAccessToken> = {
    issuerUri: string;
    decodedAccessTokenSchema?: ZodSchemaLike<DecodedAccessToken_RFC9068, DecodedAccessToken>;
};

export type OidcBackend<DecodedAccessToken extends Record<string, unknown>> = {
    verifyAndDecodeAccessToken(params: {
        accessToken: string;
    }): Promise<ResultOfAccessTokenVerify<DecodedAccessToken>>;
};

export type ResultOfAccessTokenVerify<DecodedAccessToken> =
    | ResultOfAccessTokenVerify.Valid<DecodedAccessToken>
    | ResultOfAccessTokenVerify.Invalid;

export namespace ResultOfAccessTokenVerify {
    export type Valid<DecodedAccessToken> = {
        isValid: true;

        decodedAccessToken: DecodedAccessToken;
        decodedAccessToken_original: DecodedAccessToken_RFC9068;

        errorCase?: never;
        errorMessage?: never;
    };

    export type Invalid = {
        isValid: false;
        errorCase: "expired" | "invalid signature" | "does not respect schema";
        errorMessage: string;

        decodedAccessToken?: never;
        decodedAccessToken_original?: never;
    };
}

export async function createOidcBackend<
    DecodedAccessToken extends Record<string, unknown> = DecodedAccessToken_RFC9068
>(params: ParamsOfCreateOidcBackend<DecodedAccessToken>): Promise<OidcBackend<DecodedAccessToken>> {
    const { issuerUri, decodedAccessTokenSchema } = params;

    let publicSigningKeys = await fetchPublicSigningKeys({ issuerUri });

    const evtInvalidSignature = Evt.create<void>();

    evtInvalidSignature.pipe(throttleTime(3600_000)).attach(async () => {
        const publicSigningKeys_new = await (async function callee(
            count: number
        ): Promise<PublicSigningKeys | undefined> {
            let wrap: PublicSigningKeys | undefined;

            try {
                wrap = await fetchPublicSigningKeys({ issuerUri });
            } catch (error) {
                if (count === 9) {
                    console.warn(
                        `Failed to refresh public key and signing algorithm after ${count + 1} attempts`
                    );

                    return undefined;
                }

                const delayMs = 1000 * Math.pow(2, count);

                console.warn(
                    `Failed to refresh public key and signing algorithm: ${String(
                        error
                    )}, retrying in ${delayMs}ms`
                );

                await new Promise(resolve => setTimeout(resolve, delayMs));

                return callee(count + 1);
            }

            return wrap;
        })(0);

        if (publicSigningKeys_new === undefined) {
            return;
        }

        publicSigningKeys = publicSigningKeys_new;
    });

    return {
        verifyAndDecodeAccessToken: async ({ accessToken }) => {
            let kid: string;
            let alg: string;

            {
                let header: ReturnType<typeof decodeProtectedHeader>;

                try {
                    header = decodeProtectedHeader(accessToken);
                } catch {
                    return {
                        isValid: false,
                        errorCase: "invalid signature",
                        errorMessage: "Failed to decode the JWT header"
                    };
                }

                const { kid: kidFromHeader, alg: algFromHeader } = header;

                if (typeof kidFromHeader !== "string" || kidFromHeader.length === 0) {
                    return {
                        isValid: false,
                        errorCase: "invalid signature",
                        errorMessage: "The decoded JWT header does not have a kid property"
                    };
                }

                if (typeof algFromHeader !== "string") {
                    return {
                        isValid: false,
                        errorCase: "invalid signature",
                        errorMessage: "The decoded JWT header does not specify an algorithm"
                    };
                }

                const supportedAlgs = [
                    "RS256",
                    "RS384",
                    "RS512",
                    "ES256",
                    "ES384",
                    "ES512",
                    "PS256",
                    "PS384",
                    "PS512"
                ] as const;

                if (!isAmong(supportedAlgs, algFromHeader as (typeof supportedAlgs)[number])) {
                    return {
                        isValid: false,
                        errorCase: "invalid signature",
                        errorMessage: `Unsupported or too weak algorithm ${algFromHeader}`
                    };
                }

                kid = kidFromHeader;
                alg = algFromHeader;
            }

            if (!publicSigningKeys.kidSet.has(kid)) {
                return {
                    isValid: false,
                    errorCase: "invalid signature",
                    errorMessage: `No public signing key found with kid ${kid}`
                };
            }

            let payload: JWTPayload;

            try {
                const verification = await jwtVerify(accessToken, publicSigningKeys.keyResolver, {
                    algorithms: [alg]
                });

                payload = verification.payload;
            } catch (error) {
                if (error instanceof errors.JWTExpired) {
                    return id<ResultOfAccessTokenVerify.Invalid>({
                        isValid: false,
                        errorCase: "expired",
                        errorMessage: error.message
                    });
                }

                evtInvalidSignature.post();

                return id<ResultOfAccessTokenVerify.Invalid>({
                    isValid: false,
                    errorCase: "invalid signature",
                    errorMessage: error instanceof Error ? error.message : String(error)
                });
            }

            const decodedAccessToken_unknown = payload as unknown;

            try {
                zDecodedAccessToken_RFC9068.parse(decodedAccessToken_unknown);
            } catch (error) {
                return id<ResultOfAccessTokenVerify.Invalid>({
                    isValid: false,
                    errorCase: "does not respect schema",
                    errorMessage: [
                        `The decoded access token does not satisfies`,
                        `the shape mandated by RFC9068: ${String(error)}`
                    ].join(" ")
                });
            }

            assert(is<DecodedAccessToken_RFC9068>(decodedAccessToken_unknown));

            const decodedAccessToken_original = decodedAccessToken_unknown;

            let decodedAccessToken: DecodedAccessToken;

            if (decodedAccessTokenSchema === undefined) {
                decodedAccessToken = decodedAccessToken_original as unknown as DecodedAccessToken;
            } else {
                try {
                    decodedAccessToken = decodedAccessTokenSchema.parse(decodedAccessToken_original);
                } catch (error) {
                    return id<ResultOfAccessTokenVerify.Invalid>({
                        isValid: false,
                        errorCase: "does not respect schema",
                        errorMessage: String(error)
                    });
                }
            }

            return id<ResultOfAccessTokenVerify.Valid<DecodedAccessToken>>({
                isValid: true,
                decodedAccessToken,
                decodedAccessToken_original
            });
        }
    };
}

type PublicSigningKeys = {
    keyResolver: ReturnType<typeof createLocalJWKSet>;
    kidSet: Set<string>;
};

async function fetchPublicSigningKeys(params: { issuerUri: string }): Promise<PublicSigningKeys> {
    const { issuerUri } = params;

    const { jwks_uri } = await (async () => {
        const url = `${issuerUri.replace(/\/$/, "")}/.well-known/openid-configuration`;

        const response = await fetch(url);

        if (!response.ok) {
            throw new Error(
                `Failed to fetch openid configuration of the issuerUri: ${issuerUri} (${url}): ${response.statusText}`
            );
        }

        let data: unknown;

        try {
            data = await response.json();
        } catch (error) {
            throw new Error(`Failed to parse json from ${url}: ${String(error)}`);
        }

        {
            type WellKnownConfiguration = {
                jwks_uri: string;
            };

            const zWellKnownConfiguration = z.object({
                jwks_uri: z.string()
            });

            assert<Equals<WellKnownConfiguration, z.infer<typeof zWellKnownConfiguration>>>();

            try {
                zWellKnownConfiguration.parse(data);
            } catch {
                throw new Error(`${url} does not have a jwks_uri property`);
            }

            assert(is<WellKnownConfiguration>(data));
        }

        const { jwks_uri } = data;

        return { jwks_uri };
    })();

    const { jwks } = await (async () => {
        const response = await fetch(jwks_uri);

        if (!response.ok) {
            throw new Error(
                `Failed to fetch public key and algorithm from ${jwks_uri}: ${response.statusText}`
            );
        }

        let jwks: unknown;

        try {
            jwks = await response.json();
        } catch (error) {
            throw new Error(`Failed to parse json from ${jwks_uri}: ${String(error)}`);
        }

        {
            type Jwks = {
                keys: {
                    kid: string;
                    kty: string;
                    use?: string;
                    alg?: string;
                }[];
            };

            const zJwks = z.object({
                keys: z.array(
                    z.object({
                        kid: z.string(),
                        kty: z.string(),
                        use: z.string().optional(),
                        alg: z.string().optional()
                    })
                )
            });

            assert<Equals<Jwks, z.infer<typeof zJwks>>>();

            try {
                zJwks.parse(jwks);
            } catch {
                throw new Error(`${jwks_uri} does not have the expected shape`);
            }

            assert(is<Jwks>(jwks));
        }

        return { jwks };
    })();

    //const signatureKeys = jwks.keys.filter((key): key is JWKS["keys"][number] & { kid: string } => {
    const signatureKeys = jwks.keys.filter(key => {
        if (typeof key.kid !== "string" || key.kid.length === 0) {
            return false;
        }

        if (key.use !== undefined && key.use !== "sig") {
            return false;
        }

        const supportedKty = ["RSA", "EC"] as const;

        if (!supportedKty.includes(key.kty as (typeof supportedKty)[number])) {
            return false;
        }

        return true;
    });

    assert(
        signatureKeys.length !== 0,
        `No public signing key found at ${jwks_uri}, ${JSON.stringify(jwks, null, 2)}`
    );

    const kidSet = new Set(signatureKeys.map(({ kid }) => kid));

    const keyResolver = createLocalJWKSet({
        keys: signatureKeys
    });

    return {
        keyResolver,
        kidSet
    };
}
