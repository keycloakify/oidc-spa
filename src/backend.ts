import { fetch } from "./vendor/backend/node-fetch";
import { assert, isAmong, id, type Equals, is } from "./vendor/backend/tsafe";
import * as jwt from "./vendor/backend/jsonwebtoken";
import { z } from "./vendor/backend/zod";
import { Evt } from "./vendor/backend/evt";
import { throttleTime } from "./vendor/backend/evt";

export type ParamsOfCreateOidcBackend<DecodedAccessToken extends Record<string, unknown>> = {
    issuerUri: string;
    decodedAccessTokenSchema?: { parse: (data: unknown) => DecodedAccessToken };
};

export type OidcBackend<DecodedAccessToken extends Record<string, unknown>> = {
    verifyAndDecodeAccessToken(params: {
        accessToken: string;
    }): ResultOfAccessTokenVerify<DecodedAccessToken>;
};

export type ResultOfAccessTokenVerify<DecodedAccessToken> =
    | ResultOfAccessTokenVerify.Valid<DecodedAccessToken>
    | ResultOfAccessTokenVerify.Invalid;

export namespace ResultOfAccessTokenVerify {
    export type Valid<DecodedAccessToken> = {
        isValid: true;
        decodedAccessToken: DecodedAccessToken;

        errorCase?: never;
        errorMessage?: never;
    };

    export type Invalid = {
        isValid: false;
        errorCase: "expired" | "invalid signature" | "does not respect schema";
        errorMessage: string;

        decodedAccessToken?: never;
    };
}

export async function createOidcBackend<DecodedAccessToken extends Record<string, unknown>>(
    params: ParamsOfCreateOidcBackend<DecodedAccessToken>
): Promise<OidcBackend<DecodedAccessToken>> {
    const { issuerUri, decodedAccessTokenSchema = z.record(z.unknown()) } = params;

    let { publicKey, signingAlgorithm } = await fetchPublicKeyAndSigningAlgorithm({ issuerUri });

    const evtInvalidSignature = Evt.create<void>();

    evtInvalidSignature.pipe(throttleTime(3600_000)).attach(async () => {
        const wrap = await (async function callee(
            count: number
        ): Promise<ReturnType<typeof fetchPublicKeyAndSigningAlgorithm> | undefined> {
            let wrap;

            try {
                wrap = await fetchPublicKeyAndSigningAlgorithm({ issuerUri });
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

        if (wrap === undefined) {
            return;
        }

        publicKey = wrap.publicKey;
        signingAlgorithm = wrap.signingAlgorithm;
    });

    return {
        verifyAndDecodeAccessToken: ({ accessToken }) => {
            let result = id<ResultOfAccessTokenVerify<DecodedAccessToken> | undefined>(undefined);

            jwt.verify(accessToken, publicKey, { algorithms: [signingAlgorithm] }, (err, decoded) => {
                invalid: {
                    if (!err) {
                        break invalid;
                    }

                    if (err.name === "TokenExpiredError") {
                        result = id<ResultOfAccessTokenVerify.Invalid>({
                            isValid: false,
                            errorCase: "expired",
                            errorMessage: err.message
                        });
                        return;
                    }

                    evtInvalidSignature.post();

                    result = id<ResultOfAccessTokenVerify.Invalid>({
                        isValid: false,
                        errorCase: "invalid signature",
                        errorMessage: err.message
                    });

                    return;
                }

                let decodedAccessToken: DecodedAccessToken;

                try {
                    decodedAccessToken = decodedAccessTokenSchema.parse(decoded) as DecodedAccessToken;
                } catch (error) {
                    result = id<ResultOfAccessTokenVerify.Invalid>({
                        isValid: false,
                        errorCase: "does not respect schema",
                        errorMessage: String(error)
                    });

                    return;
                }

                result = id<ResultOfAccessTokenVerify.Valid<DecodedAccessToken>>({
                    isValid: true,
                    decodedAccessToken: decodedAccessToken
                });
            });

            assert(result !== undefined);

            return result;
        }
    };
}

async function fetchPublicKeyAndSigningAlgorithm(params: { issuerUri: string }) {
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

    const response = await fetch(jwks_uri);

    if (!response.ok) {
        throw new Error(
            `Failed to fetch public key and algorithm from ${jwks_uri}: ${response.statusText}`
        );
    }

    let data: unknown;

    try {
        data = await response.json();
    } catch (error) {
        throw new Error(`Failed to parse json from ${jwks_uri}: ${String(error)}`);
    }

    {
        type Jwks = {
            keys: {
                use: string;
                alg: string;
                x5c: [string, ...string[]];
            }[];
        };

        const zJwks = z.object({
            keys: z.array(
                z.object({
                    use: z.string(),
                    alg: z.string(),
                    x5c: z.tuple([z.string()]).rest(z.string())
                })
            )
        });

        assert<Equals<Jwks, z.infer<typeof zJwks>>>();

        try {
            zJwks.parse(data);
        } catch {
            throw new Error(`${jwks_uri} does not have the expected shape`);
        }

        assert(is<Jwks>(data));
    }

    const signatureKey = data.keys.find(({ use }) => use === "sig");

    assert(signatureKey !== undefined, "No signature key found");

    const signingAlgorithm = signatureKey["alg"];

    assert(
        isAmong(["RS256", "RS384", "RS512"], signingAlgorithm),
        `Unsupported algorithm ${signingAlgorithm}`
    );

    const publicKey = [
        "-----BEGIN CERTIFICATE-----",
        signatureKey.x5c[0],
        "-----END CERTIFICATE-----"
    ].join("\n");

    return { publicKey, signingAlgorithm };
}
