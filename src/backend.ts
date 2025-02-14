import { fetch } from "./vendor/backend/node-fetch";
import { assert, isAmong, id } from "./vendor/backend/tsafe";
import * as jwt from "./vendor/backend/jsonwebtoken";
import { z } from "./vendor/backend/zod";
import { Evt } from "./vendor/backend/evt";
import { throttleTime } from "./vendor/backend/evt";

export type ParamsOfCreateOidcBackend<DecodedAccessToken extends Record<string, unknown>> = {
    issuerUri: string;
    decodedAccessTokenSchema?: { parse: (data: unknown) => DecodedAccessToken };
    certificateUri?: string;
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
    const { issuerUri, decodedAccessTokenSchema = z.record(z.unknown()), certificateUri } = params;

    let { publicKey, signingAlgorithm } = await fetchPublicKeyAndSigningAlgorithm({ issuerUri, certificateUri });

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

async function fetchPublicKeyAndSigningAlgorithm(params: { issuerUri: string, certificateUri?: string }) {
    const { issuerUri, certificateUri } = params;

    const certUri = certificateUri ?? `${issuerUri.replace(/\/$/, "")}/protocol/openid-connect/certs`;

    const response = await fetch(certUri);

    if (!response.ok) {
        throw new Error(
            `Failed to fetch public key and algorithm from ${certUri}: ${response.statusText}`
        );
    }

    let data;

    try {
        data = await response.json();
    } catch (error) {
        throw new Error(`Failed to parse json from ${certUri}: ${String(error)}`);
    }

    const { keys } = z
        .object({
            keys: z.array(
                z.object({
                    use: z.string(),
                    alg: z.string(),
                    x5c: z.tuple([z.string()])
                })
            )
        })
        .parse(data);

    const signatureKey = keys.find(({ use }) => use === "sig");

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
