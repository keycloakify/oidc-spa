import type { ZodSchemaLike } from "../tools/ZodSchemaLike";
import type {
    DecodedAccessToken_RFC9068,
    OidcSpaUtils,
    ParamsOfBootstrap,
    ValidateAndDecodeAccessToken
} from "./types";
import { Deferred } from "../tools/Deferred";
import { decodeProtectedHeader, jwtVerify, createLocalJWKSet, errors } from "../vendor/server/jose";
import { assert, isAmong, id, type Equals, is, Reflect } from "../vendor/server/tsafe";
import { z } from "../vendor/server/zod";
import { Evt, throttleTime } from "../vendor/server/evt";
import { decodeJwt } from "../tools/decodeJwt";

export function createOidcSpaUtils<DecodedAccessToken extends Record<string, unknown>>(params: {
    decodedAccessTokenSchema: ZodSchemaLike<DecodedAccessToken_RFC9068, DecodedAccessToken> | undefined;
}): OidcSpaUtils<DecodedAccessToken> {
    const { decodedAccessTokenSchema } = params;

    const dParamsOfBootstrap = new Deferred<ParamsOfBootstrap<DecodedAccessToken>>();

    const evtPublicSigningKeys = Evt.create<PublicSigningKeys | undefined>(undefined);

    const evtInvalidSignature = Evt.create<void>();

    evtInvalidSignature.pipe(throttleTime(3600_000)).attach(async () => {
        const publicSigningKeys_new = await (async function callee(
            count: number
        ): Promise<PublicSigningKeys | undefined> {
            const paramsOfBootstrap = await dParamsOfBootstrap.pr;

            assert(paramsOfBootstrap.implementation === "real");

            const { issuerUri } = paramsOfBootstrap;

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

        evtPublicSigningKeys.state = publicSigningKeys_new;
    });

    let bootstrapAuth_prResolved: Promise<void> | undefined = undefined;

    type Out = OidcSpaUtils<DecodedAccessToken>;

    const bootstrapAuth: Out["bootstrapAuth"] = paramsOfBootstrap => {
        if (bootstrapAuth_prResolved !== undefined) {
            return bootstrapAuth_prResolved;
        }

        return (bootstrapAuth_prResolved = (async () => {
            dParamsOfBootstrap.resolve(paramsOfBootstrap);

            if (paramsOfBootstrap.implementation === "real") {
                evtPublicSigningKeys.state = await fetchPublicSigningKeys({
                    issuerUri: paramsOfBootstrap.issuerUri
                });
            }
        })());
    };

    const validateAndDecodeAccessToken: Out["validateAndDecodeAccessToken"] = async ({ request }) => {
        const paramsOfBootstrap = await dParamsOfBootstrap.pr;

        if (
            paramsOfBootstrap.implementation === "mock" &&
            paramsOfBootstrap.behavior === "use static identity"
        ) {
            return id<ValidateAndDecodeAccessToken.ReturnType.Success<DecodedAccessToken>>({
                isSuccess: true,
                decodedAccessToken: paramsOfBootstrap.decodedAccessToken_mock,
                get accessToken() {
                    if (paramsOfBootstrap.accessToken_mock === undefined) {
                        throw new Error(
                            [
                                "oidc-spa: No mock provided for accessToken.",
                                "Provide accessToken_mock to bootstrapAuth"
                            ].join(" ")
                        );
                    }

                    return paramsOfBootstrap.accessToken_mock;
                },
                get decodedAccessToken_original() {
                    if (paramsOfBootstrap.decodedAccessToken_original_mock === undefined) {
                        throw new Error(
                            [
                                "oidc-spa: No mock provided for decodedAccessToken_original.",
                                "Provide decodedAccessToken_original_mock to bootstrapAuth"
                            ].join(" ")
                        );
                    }

                    return paramsOfBootstrap.decodedAccessToken_original_mock;
                }
            });
        }

        if (!request.headers.Authorization) {
            return id<ValidateAndDecodeAccessToken.ReturnType.Errored>({
                isSuccess: false,
                errorCause: "missing Authorization header",
                debugErrorMessage: "The request is anonymous, no Authorization header"
            });
        }

        const [scheme, accessToken, ...rest] = request.headers.Authorization.split(" ");

        if (!accessToken || rest.length !== 0) {
            return id<ValidateAndDecodeAccessToken.ReturnType.Errored>({
                isSuccess: false,
                errorCause: "validation error",
                debugErrorMessage: "Malformed Authorization header"
            });
        }

        if (!isAmong(["Bearer", "DPoP"], scheme)) {
            return id<ValidateAndDecodeAccessToken.ReturnType.Errored>({
                isSuccess: false,
                errorCause: "validation error",
                debugErrorMessage: `Unsupported scheme ${scheme}, expected Bearer or DPoP`
            });
        }

        let decodedAccessToken_original: unknown;

        validation: {
            if (paramsOfBootstrap.implementation === "mock") {
                assert<Equals<typeof paramsOfBootstrap.behavior, "decode only">>;

                decodedAccessToken_original = decodeJwt(accessToken);

                try {
                    zDecodedAccessToken_RFC9068.parse(decodedAccessToken_original);
                } catch (error) {
                    assert(error instanceof Error, "38292332");

                    return id<ValidateAndDecodeAccessToken.ReturnType.Errored>({
                        isSuccess: false,
                        errorCause: "validation error",
                        debugErrorMessage: [
                            `The decoded access token does not satisfies`,
                            `the shape mandated by RFC9068: ${error.message}`
                        ].join(" ")
                    });
                }

                assert(is<DecodedAccessToken_RFC9068>(decodedAccessToken_original));

                break validation;
            }

            let kid: string;
            let alg: string;

            {
                let header: ReturnType<typeof decodeProtectedHeader>;

                try {
                    header = decodeProtectedHeader(accessToken);
                } catch {
                    return id<ValidateAndDecodeAccessToken.ReturnType.Errored>({
                        isSuccess: false,
                        errorCause: "validation error",
                        debugErrorMessage: "Failed to decode the JWT header"
                    });
                }

                const { kid: kidFromHeader, alg: algFromHeader } = header;

                if (typeof kidFromHeader !== "string" || kidFromHeader.length === 0) {
                    return id<ValidateAndDecodeAccessToken.ReturnType.Errored>({
                        isSuccess: false,
                        errorCause: "validation error",
                        debugErrorMessage: "The decoded JWT header does not have a kid property"
                    });
                }

                if (typeof algFromHeader !== "string") {
                    return id<ValidateAndDecodeAccessToken.ReturnType.Errored>({
                        isSuccess: false,
                        errorCause: "validation error",
                        debugErrorMessage: "The decoded JWT header does not specify an algorithm"
                    });
                }

                if (
                    !isAmong(
                        [
                            "RS256",
                            "RS384",
                            "RS512",
                            "ES256",
                            "ES384",
                            "ES512",
                            "PS256",
                            "PS384",
                            "PS512"
                        ],
                        algFromHeader
                    )
                ) {
                    return id<ValidateAndDecodeAccessToken.ReturnType.Errored>({
                        isSuccess: false,
                        errorCause: "validation error",
                        debugErrorMessage: `Unsupported or too weak algorithm ${algFromHeader}`
                    });
                }

                kid = kidFromHeader;
                alg = algFromHeader;
            }

            const publicSigningKeys = evtPublicSigningKeys.state;

            assert(publicSigningKeys !== undefined);

            if (!publicSigningKeys.kidSet.has(kid)) {
                return id<ValidateAndDecodeAccessToken.ReturnType.Errored>({
                    isSuccess: false,
                    errorCause: "validation error",
                    debugErrorMessage: `No public signing key found with kid ${kid}`
                });
            }

            try {
                const verification = await jwtVerify(accessToken, publicSigningKeys.keyResolver, {
                    algorithms: [alg]
                });

                decodedAccessToken_original = verification.payload;
            } catch (error) {
                assert(error instanceof Error, "3922843");

                if (error instanceof errors.JWTExpired) {
                    return id<ValidateAndDecodeAccessToken.ReturnType.Errored>({
                        isSuccess: false,
                        errorCause: "validation error - access token expired",
                        debugErrorMessage: error.message
                    });
                }

                evtInvalidSignature.post();

                return id<ValidateAndDecodeAccessToken.ReturnType.Errored>({
                    isSuccess: false,
                    errorCause: "validation error - invalid signature",
                    debugErrorMessage: error.message
                });
            }

            try {
                zDecodedAccessToken_RFC9068.parse(decodedAccessToken_original);
            } catch (error) {
                assert(error instanceof Error, "382923");

                return id<ValidateAndDecodeAccessToken.ReturnType.Errored>({
                    isSuccess: false,
                    errorCause: "validation error",
                    debugErrorMessage: [
                        `The decoded access token does not satisfies`,
                        `the shape mandated by RFC9068: ${error.message}`
                    ].join(" ")
                });
            }

            assert(is<DecodedAccessToken_RFC9068>(decodedAccessToken_original));

            validate_audience: {
                const { expectedAudience } = paramsOfBootstrap;

                if (expectedAudience === undefined) {
                    break validate_audience;
                }

                const audiences =
                    decodedAccessToken_original.aud instanceof Array
                        ? decodedAccessToken_original.aud
                        : [decodedAccessToken_original.aud];

                if (!audiences.includes(expectedAudience)) {
                    return id<ValidateAndDecodeAccessToken.ReturnType.Errored>({
                        isSuccess: false,
                        errorCause: "validation error",
                        debugErrorMessage: [
                            `Not expected audience, got aud claim ${JSON.stringify(
                                decodedAccessToken_original.aud
                            )}`,
                            `but expected "${expectedAudience}".`
                        ].join(" ")
                    });
                }
            }

            validate_DPoP: {
                const cnf_jkt =
                    decodedAccessToken_original.cnf === undefined
                        ? undefined
                        : decodedAccessToken_original.cnf.jkt;

                if (cnf_jkt !== undefined && typeof cnf_jkt !== "string") {
                    return id<ValidateAndDecodeAccessToken.ReturnType.Errored>({
                        isSuccess: false,
                        errorCause: "validation error",
                        debugErrorMessage: "cnf.jkt claim is expected to be a string"
                    });
                }

                if (scheme === "Bearer") {
                    if (cnf_jkt !== undefined) {
                        return id<ValidateAndDecodeAccessToken.ReturnType.Errored>({
                            isSuccess: false,
                            errorCause: "validation error",
                            debugErrorMessage: [
                                "access token is DPoP bound (cnf.jkt claim present)",
                                "but used with bearer scheme"
                            ].join(" ")
                        });
                    }

                    break validate_DPoP;
                }
                assert<Equals<typeof scheme, "DPoP">>;

                if (cnf_jkt === undefined) {
                    return id<ValidateAndDecodeAccessToken.ReturnType.Errored>({
                        isSuccess: false,
                        errorCause: "validation error",
                        debugErrorMessage: [
                            "DPoP validation error, missing cnf.jtk claim",
                            "in the access token payload"
                        ].join(" ")
                    });
                }

                if (!request.headers.DPoP) {
                    return id<ValidateAndDecodeAccessToken.ReturnType.Errored>({
                        isSuccess: false,
                        errorCause: "validation error",
                        debugErrorMessage: "Scheme DPoP was specified but the DPoP header is missing"
                    });
                }

                // TODO: Validate DPoP
                request.method;
                request.url;
                request.headers.DPoP;
                decodedAccessToken_original;
                cnf_jkt;
            }
        }

        let decodedAccessToken: DecodedAccessToken;

        if (decodedAccessTokenSchema === undefined) {
            // @ts-expect-error: We know it will match because DecodedAccessToken will default to DecodedAccessToken_RFC9068
            decodedAccessToken = decodedAccessToken_original;
        } else {
            try {
                decodedAccessToken = decodedAccessTokenSchema.parse(decodedAccessToken_original);
            } catch (error) {
                assert(error instanceof Error);

                return id<ValidateAndDecodeAccessToken.ReturnType.Errored>({
                    isSuccess: false,
                    errorCause: "validation error",
                    debugErrorMessage: [
                        `The decoded access token does not satisfies`,
                        `the shape that the application expects: ${error.message}`
                    ].join(" ")
                });
            }
        }

        return id<ValidateAndDecodeAccessToken.ReturnType.Success<DecodedAccessToken>>({
            isSuccess: true,
            decodedAccessToken,
            decodedAccessToken_original,
            accessToken
        });
    };

    return {
        bootstrapAuth,
        validateAndDecodeAccessToken,
        ofTypeDecodedAccessToken: Reflect<DecodedAccessToken>()
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
