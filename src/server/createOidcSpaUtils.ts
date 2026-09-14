import type { ZodSchemaLike } from "../tools/ZodSchemaLike";
import type {
    OidcSpaUtils,
    ParamsOfBootstrap,
    ValidateAndGetAccessTokenClaims,
    AccessTokenClaims_specs
} from "./types";
import { Deferred } from "../tools/Deferred";
import {
    decodeProtectedHeader,
    jwtVerify,
    createLocalJWKSet,
    errors,
    importJWK,
    calculateJwkThumbprint,
    base64url
} from "../vendor/server/jose";
import { assert, isAmong, id, type Equals, is } from "../vendor/server/tsafe";
import { z } from "../vendor/server/zod";
import { Evt, throttleTime } from "../vendor/server/evt";
import { decodeJwt } from "../tools/decodeJwt";

export function createOidcSpaUtils<AccessTokenClaims>(params: {
    accessTokenClaimsSchema: ZodSchemaLike<AccessTokenClaims_specs, AccessTokenClaims> | undefined;
}): OidcSpaUtils<AccessTokenClaims> {
    const { accessTokenClaimsSchema } = params;

    const dParamsOfBootstrap = new Deferred<ParamsOfBootstrap<AccessTokenClaims>>();

    const { getPublicSigningKeys, evtInvalidSignature } = (() => {
        const evtPublicSigningKeys = Evt.create<PublicSigningKeys | undefined>(undefined);

        async function updatePublicSigningKeys() {
            const publicSigningKeys_new = await (async function callee(
                count: number
            ): Promise<PublicSigningKeys | undefined> {
                const paramsOfBootstrap = await dParamsOfBootstrap.pr;

                assert(
                    paramsOfBootstrap.mode === "real" || paramsOfBootstrap.mode === undefined,
                    "22933023"
                );

                const { issuerUri } = paramsOfBootstrap;

                let wrap: PublicSigningKeys | undefined;

                try {
                    wrap = await fetchPublicSigningKeys({ issuerUri });
                } catch (error) {
                    assert(error instanceof Error);

                    if (count === 9) {
                        console.warn(
                            `Could not fetch public signing keys after ${
                                count + 1
                            } attempts. Resetting exponential backoff.`
                        );

                        return undefined;
                    }

                    const delayMs = 1000 * Math.pow(2, count);

                    console.warn(
                        `Could not fetch public signing keys: ${error.message}. Retrying in ${delayMs}ms.`
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
        }

        const evtInvalidSignature = Evt.create<void>();

        evtInvalidSignature.pipe(throttleTime(3600_000)).attach(() => updatePublicSigningKeys());

        let hasBeenCalled_getPublicSigningKeys = false;

        async function getPublicSigningKeys(): Promise<PublicSigningKeys | undefined> {
            if (!hasBeenCalled_getPublicSigningKeys) {
                hasBeenCalled_getPublicSigningKeys = true;

                (async () => {
                    while (evtPublicSigningKeys.state === undefined) {
                        await updatePublicSigningKeys();
                    }
                })();
            }

            const publicSigningKeys = await evtPublicSigningKeys
                .waitFor(publicSigningKeys => publicSigningKeys !== undefined, 5_000)
                .catch(() => undefined);

            return publicSigningKeys;
        }

        return { getPublicSigningKeys, evtInvalidSignature };
    })();

    type Out = OidcSpaUtils<AccessTokenClaims>;

    const bootstrapAuth: Out["bootstrapAuth"] = paramsOfBootstrap => {
        if (dParamsOfBootstrap.getState().hasResolved) {
            console.warn("oidc-spa: bootstrapAuth() has already been called, ignoring");
            return;
        }

        dParamsOfBootstrap.resolve(paramsOfBootstrap);
    };

    const { getIsDpopPoofSeenRecordIfNotSeen } = (() => {
        const timeSeenByDpopProofId = new Map<string, number>();

        const evtDpopProofAdded = Evt.create<void>();

        evtDpopProofAdded.pipe(throttleTime(40_000)).attach(async () => {
            await Promise.resolve();

            const now = Date.now();

            for (const [dpopProofId, timeSeen] of timeSeenByDpopProofId) {
                if (now - timeSeen > 40_000) {
                    timeSeenByDpopProofId.delete(dpopProofId);
                } else {
                    // NOTE: All entries added after are more recent.
                    break;
                }
            }
        });

        function getIsDpopPoofSeenRecordIfNotSeen(params: { jkt: string; jti: string }): boolean {
            const { jkt, jti } = params;
            const dpopProofId = `${jkt}:${jti}`;

            if (timeSeenByDpopProofId.has(dpopProofId)) {
                return true;
            }

            {
                timeSeenByDpopProofId.set(dpopProofId, Date.now());

                if (timeSeenByDpopProofId.size > 50_000) {
                    const firstEntry = timeSeenByDpopProofId[Symbol.iterator]().next().value;

                    assert(firstEntry !== undefined, "3922304");

                    const [key] = firstEntry;

                    timeSeenByDpopProofId.delete(key);
                }

                evtDpopProofAdded.post();
            }

            return false;
        }

        return { getIsDpopPoofSeenRecordIfNotSeen };
    })();

    const validateAndGetAccessTokenClaims: Out["validateAndGetAccessTokenClaims"] = async params => {
        const paramsOfBootstrap = await dParamsOfBootstrap.pr;

        if (paramsOfBootstrap.mode === "mock") {
            return id<ValidateAndGetAccessTokenClaims.ReturnType.Success<AccessTokenClaims>>({
                isSuccess: true,
                accessTokenClaims: paramsOfBootstrap.accessTokenClaims_mock,
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
                get accessTokenClaims_original() {
                    if (paramsOfBootstrap.accessTokenClaims_original_mock === undefined) {
                        if (accessTokenClaimsSchema === undefined) {
                            return paramsOfBootstrap.accessTokenClaims_mock as AccessTokenClaims_specs;
                        }

                        throw new Error(
                            [
                                "oidc-spa: No mock provided for accessTokenClaims_original.",
                                "Provide accessTokenClaims_original_mock to bootstrapAuth"
                            ].join(" ")
                        );
                    }

                    return paramsOfBootstrap.accessTokenClaims_original_mock;
                }
            });
        }

        let accessTokenClaims_original: unknown;

        validation: {
            if (paramsOfBootstrap.mode === "unsafe decode only") {
                accessTokenClaims_original = decodeJwt(params.accessToken);

                try {
                    zAccessTokenClaims_specs.parse(accessTokenClaims_original);
                } catch (error) {
                    assert(error instanceof Error, "38292332");

                    return id<ValidateAndGetAccessTokenClaims.ReturnType.Errored>({
                        isSuccess: false,
                        debugErrorMessage: [
                            `The decoded access token does not satisfies`,
                            `the shape mandated the intersection of RFC9068 and RFC7662: ${error.message}`
                        ].join(" ")
                    });
                }

                assert(is<AccessTokenClaims_specs>(accessTokenClaims_original));

                break validation;
            }

            assert<Equals<typeof paramsOfBootstrap.mode, "real" | undefined>>;

            switch (paramsOfBootstrap.accessTokenValidationMethod) {
                case "offline JWT validation":
                    {
                        let kid: string;
                        let alg: string;

                        {
                            let header: ReturnType<typeof decodeProtectedHeader>;

                            try {
                                header = decodeProtectedHeader(params.accessToken);
                            } catch {
                                return id<ValidateAndGetAccessTokenClaims.ReturnType.Errored>({
                                    isSuccess: false,
                                    debugErrorMessage: "Failed to decode the JWT header"
                                });
                            }

                            const { kid: kidFromHeader, alg: algFromHeader } = header;

                            if (typeof kidFromHeader !== "string" || kidFromHeader.length === 0) {
                                return id<ValidateAndGetAccessTokenClaims.ReturnType.Errored>({
                                    isSuccess: false,
                                    debugErrorMessage:
                                        "The decoded JWT header does not have a kid property"
                                });
                            }

                            if (typeof algFromHeader !== "string") {
                                return id<ValidateAndGetAccessTokenClaims.ReturnType.Errored>({
                                    isSuccess: false,
                                    debugErrorMessage:
                                        "The decoded JWT header does not specify an algorithm"
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
                                return id<ValidateAndGetAccessTokenClaims.ReturnType.Errored>({
                                    isSuccess: false,
                                    debugErrorMessage: `Unsupported or too weak algorithm ${algFromHeader}`
                                });
                            }

                            kid = kidFromHeader;
                            alg = algFromHeader;
                        }

                        const publicSigningKeys = await getPublicSigningKeys();

                        if (publicSigningKeys === undefined) {
                            return id<ValidateAndGetAccessTokenClaims.ReturnType.Errored>({
                                isSuccess: false,
                                debugErrorMessage:
                                    "Could not fetch the public signing keys required to validate this access token"
                            });
                        }

                        if (!publicSigningKeys.kidSet.has(kid)) {
                            evtInvalidSignature.post();
                            return id<ValidateAndGetAccessTokenClaims.ReturnType.Errored>({
                                isSuccess: false,
                                debugErrorMessage: `No public signing key found with kid ${kid}`
                            });
                        }

                        try {
                            const verification = await jwtVerify(
                                params.accessToken,
                                publicSigningKeys.keyResolver,
                                {
                                    algorithms: [alg]
                                }
                            );

                            accessTokenClaims_original = verification.payload;
                        } catch (error) {
                            assert(error instanceof Error, "3922843");

                            if (error instanceof errors.JWTExpired) {
                                return id<ValidateAndGetAccessTokenClaims.ReturnType.Errored>({
                                    isSuccess: false,
                                    debugErrorMessage: error.message
                                });
                            }

                            evtInvalidSignature.post();

                            return id<ValidateAndGetAccessTokenClaims.ReturnType.Errored>({
                                isSuccess: false,
                                debugErrorMessage: error.message
                            });
                        }

                        try {
                            zAccessTokenClaims_JWTPayload.parse(accessTokenClaims_original);
                        } catch (error) {
                            assert(error instanceof Error, "382923");

                            return id<ValidateAndGetAccessTokenClaims.ReturnType.Errored>({
                                isSuccess: false,
                                debugErrorMessage: [
                                    `The decoded access token does not satisfies`,
                                    `the shape mandated by RFC9068: ${error.message}`
                                ].join(" ")
                            });
                        }

                        assert(is<AccessTokenClaims_JWTPayload>(accessTokenClaims_original));

                        // Validate issuer
                        {
                            const { issuerUri } = paramsOfBootstrap;

                            const normalize = (url: string) => url.replace(/\/$/, "");

                            if (normalize(accessTokenClaims_original.iss) !== normalize(issuerUri)) {
                                return id<ValidateAndGetAccessTokenClaims.ReturnType.Errored>({
                                    isSuccess: false,
                                    debugErrorMessage: [
                                        `iss claim in access token payload "${accessTokenClaims_original.iss}"`,
                                        `does not match the issuerUri "${issuerUri}".`
                                    ].join(" ")
                                });
                            }
                        }

                        validate_audience: {
                            const { expectedAudience } = paramsOfBootstrap;

                            if (expectedAudience === undefined) {
                                break validate_audience;
                            }

                            const audiences =
                                accessTokenClaims_original.aud instanceof Array
                                    ? accessTokenClaims_original.aud
                                    : [accessTokenClaims_original.aud];

                            if (!audiences.includes(expectedAudience)) {
                                return id<ValidateAndGetAccessTokenClaims.ReturnType.Errored>({
                                    isSuccess: false,
                                    debugErrorMessage: [
                                        `Not expected audience, got aud claim ${JSON.stringify(
                                            accessTokenClaims_original.aud
                                        )}`,
                                        `but expected "${expectedAudience}".`
                                    ].join(" ")
                                });
                            }
                        }
                    }
                    break;
                case "introspection endpoint":
                    {
                        // TODO:
                        // use `const { clientId, clientSecret } = paramsOfBootstrap;` and `params.accessToken`
                        // to implement the call to the introspection endpoint and call

                        try {
                            zAccessTokenClaims_specs.parse(accessTokenClaims_original);
                        } catch (error) {
                            assert(error instanceof Error, "38292332");

                            return id<ValidateAndGetAccessTokenClaims.ReturnType.Errored>({
                                isSuccess: false,
                                debugErrorMessage: [
                                    `The decoded access token does not satisfies`,
                                    `the shape mandated the intersection of RFC9068 and RFC7662: ${error.message}`
                                ].join(" ")
                            });
                        }

                        assert(is<AccessTokenClaims_specs>(accessTokenClaims_original));
                    }
                    break;
            }

            validate_DPoP: {
                const cnf_jkt =
                    accessTokenClaims_original.cnf === undefined
                        ? undefined
                        : accessTokenClaims_original.cnf.jkt;

                if (cnf_jkt !== undefined && typeof cnf_jkt !== "string") {
                    return id<ValidateAndGetAccessTokenClaims.ReturnType.Errored>({
                        isSuccess: false,
                        debugErrorMessage: "cnf.jkt claim is expected to be a string"
                    });
                }

                if (params.scheme === "Bearer") {
                    if (!params.rejectIfAccessTokenDPoPBound) {
                        if (process.env.NODE_ENV === "development") {
                            console.warn(
                                [
                                    "oidc-spa: Accepting a DPoP bound token without",
                                    "validating the DPoP proof because rejectIfAccessTokenDPoPBound was explicitly",
                                    "set to false"
                                ].join(" ")
                            );
                        }

                        break validate_DPoP;
                    }

                    if (cnf_jkt !== undefined) {
                        return id<ValidateAndGetAccessTokenClaims.ReturnType.Errored>({
                            isSuccess: false,
                            debugErrorMessage: [
                                "access token is DPoP bound (cnf.jkt claim present)",
                                "but used with bearer scheme"
                            ].join(" ")
                        });
                    }

                    break validate_DPoP;
                }
                assert<Equals<typeof params.scheme, "DPoP">>;

                if (cnf_jkt === undefined) {
                    return id<ValidateAndGetAccessTokenClaims.ReturnType.Errored>({
                        isSuccess: false,
                        debugErrorMessage: [
                            "DPoP validation error, missing cnf.jtk claim",
                            "in the access token payload"
                        ].join(" ")
                    });
                }

                let dpopHeader: ReturnType<typeof decodeProtectedHeader>;

                try {
                    dpopHeader = decodeProtectedHeader(params.dpopProof);
                } catch {
                    return id<ValidateAndGetAccessTokenClaims.ReturnType.Errored>({
                        isSuccess: false,
                        debugErrorMessage: "Failed to decode DPoP proof header"
                    });
                }

                const { jwk, alg: dpopAlg, typ: dpopTyp } = dpopHeader;

                if (dpopAlg === undefined) {
                    return id<ValidateAndGetAccessTokenClaims.ReturnType.Errored>({
                        isSuccess: false,
                        debugErrorMessage: "DPoP proof header missing alg"
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
                        dpopAlg
                    )
                ) {
                    return id<ValidateAndGetAccessTokenClaims.ReturnType.Errored>({
                        isSuccess: false,
                        debugErrorMessage: `Unsupported or too weak DPoP algorithm ${dpopAlg}`
                    });
                }

                if (dpopTyp === undefined || dpopTyp.toLowerCase() !== "dpop+jwt") {
                    return id<ValidateAndGetAccessTokenClaims.ReturnType.Errored>({
                        isSuccess: false,
                        debugErrorMessage: "DPoP proof header typ must be dpop+jwt"
                    });
                }

                if (jwk === undefined) {
                    return id<ValidateAndGetAccessTokenClaims.ReturnType.Errored>({
                        isSuccess: false,
                        debugErrorMessage: "DPoP proof header missing jwk"
                    });
                }

                let jkt_calculated: string;

                try {
                    jkt_calculated = await calculateJwkThumbprint(jwk);
                } catch (error) {
                    return id<ValidateAndGetAccessTokenClaims.ReturnType.Errored>({
                        isSuccess: false,
                        debugErrorMessage: `Failed to calculate DPoP jwk thumbprint: ${String(error)}`
                    });
                }

                if (jkt_calculated !== cnf_jkt) {
                    return id<ValidateAndGetAccessTokenClaims.ReturnType.Errored>({
                        isSuccess: false,
                        debugErrorMessage: "DPoP jwk thumbprint does not match cnf.jkt claim"
                    });
                }

                let dpopPayload: Awaited<ReturnType<typeof jwtVerify>>["payload"];

                try {
                    const key = await importJWK(jwk, dpopAlg);
                    const verification = await jwtVerify(params.dpopProof, key, {
                        algorithms: [dpopAlg],
                        typ: "dpop+jwt"
                    });
                    dpopPayload = verification.payload;
                } catch (error) {
                    assert(error instanceof Error, "34022849313");

                    return id<ValidateAndGetAccessTokenClaims.ReturnType.Errored>({
                        isSuccess: false,
                        debugErrorMessage: `DPoP proof signature/structure invalid: ${error.message}`
                    });
                }

                const { htm, htu, ath, iat, jti } = dpopPayload;

                {
                    if (iat === undefined) {
                        return id<ValidateAndGetAccessTokenClaims.ReturnType.Errored>({
                            isSuccess: false,
                            debugErrorMessage: "DPoP proof missing or invalid iat claim"
                        });
                    }

                    const now = Math.floor(Date.now() / 1000);
                    const maxAgeSeconds = 40;
                    const maxFutureSkewSeconds = 3;

                    if (iat - now > maxFutureSkewSeconds) {
                        return id<ValidateAndGetAccessTokenClaims.ReturnType.Errored>({
                            isSuccess: false,
                            debugErrorMessage: "DPoP proof iat is in the future"
                        });
                    }

                    if (now - iat > maxAgeSeconds) {
                        return id<ValidateAndGetAccessTokenClaims.ReturnType.Errored>({
                            isSuccess: false,
                            debugErrorMessage: "DPoP proof iat too old"
                        });
                    }
                }

                check_htm: {
                    const errored = id<ValidateAndGetAccessTokenClaims.ReturnType.Errored>({
                        isSuccess: false,
                        debugErrorMessage: [
                            "DPoP proof htm claim does not match request method.",
                            `htm: ${htm}, expected htm: ${params.expectedHtm}`
                        ].join(" ")
                    });

                    if (typeof htm !== "string") {
                        if (!htm && params.expectedHtm === undefined) {
                            break check_htm;
                        }
                        return errored;
                    }

                    if (params.expectedHtm === undefined) {
                        return errored;
                    }

                    if (htm.toUpperCase() !== params.expectedHtm.toUpperCase()) {
                        return errored;
                    }
                }

                check_htu: {
                    const errored = id<ValidateAndGetAccessTokenClaims.ReturnType.Errored>({
                        isSuccess: false,
                        debugErrorMessage: [
                            "DPoP proof htu claim does not match request url.",
                            `htu: ${htu}, expected htu: ${params.expectedHtu}`
                        ].join(" ")
                    });

                    if (typeof htu !== "string") {
                        if (!htu && params.expectedHtu === undefined) {
                            break check_htu;
                        }
                        return errored;
                    }

                    if (params.expectedHtu === undefined) {
                        return errored;
                    }

                    if (htu !== params.expectedHtu) {
                        return errored;
                    }
                }

                if (typeof ath !== "string") {
                    return id<ValidateAndGetAccessTokenClaims.ReturnType.Errored>({
                        isSuccess: false,
                        debugErrorMessage: "DPoP proof missing ath claim"
                    });
                }

                const expectedAth = base64url.encode(
                    new Uint8Array(
                        await globalThis.crypto.subtle.digest(
                            "SHA-256",
                            new TextEncoder().encode(params.accessToken)
                        )
                    )
                );

                if (ath !== expectedAth) {
                    return id<ValidateAndGetAccessTokenClaims.ReturnType.Errored>({
                        isSuccess: false,
                        debugErrorMessage: "DPoP proof ath claim does not match access token"
                    });
                }

                if (jti === undefined) {
                    return id<ValidateAndGetAccessTokenClaims.ReturnType.Errored>({
                        isSuccess: false,
                        debugErrorMessage: "DPoP proof missing jti claim"
                    });
                }

                if (getIsDpopPoofSeenRecordIfNotSeen({ jkt: cnf_jkt, jti })) {
                    return id<ValidateAndGetAccessTokenClaims.ReturnType.Errored>({
                        isSuccess: false,
                        debugErrorMessage: "DPoP proof replayed"
                    });
                }
            }
        }

        try {
            zAccessTokenClaims_specs.parse(accessTokenClaims_original);
        } catch (error) {
            assert(error instanceof Error, "38292332");

            return id<ValidateAndGetAccessTokenClaims.ReturnType.Errored>({
                isSuccess: false,
                debugErrorMessage: [
                    `The decoded access token does not satisfies`,
                    `the shape mandated the intersection of RFC9068 and RFC7662: ${error.message}`
                ].join(" ")
            });
        }

        assert(is<AccessTokenClaims_specs>(accessTokenClaims_original));

        let accessTokenClaims: AccessTokenClaims;

        if (accessTokenClaimsSchema === undefined) {
            // @ts-expect-error: We know it will match because AccessTokenClaims will default to DecodedAccessToken_RFC9068
            accessTokenClaims = accessTokenClaims_original;
        } else {
            try {
                accessTokenClaims = accessTokenClaimsSchema.parse(accessTokenClaims_original);
            } catch (error) {
                assert(error instanceof Error, "887302013");

                return id<ValidateAndGetAccessTokenClaims.ReturnType.Errored>({
                    isSuccess: false,
                    debugErrorMessage: [
                        `The decoded access token does not satisfies`,
                        `the shape that the application expects: ${error.message}`
                    ].join(" ")
                });
            }
        }

        return id<ValidateAndGetAccessTokenClaims.ReturnType.Success<AccessTokenClaims>>({
            isSuccess: true,
            accessTokenClaims,
            accessTokenClaims_original,
            accessToken: params.accessToken
        });
    };

    return {
        bootstrapAuth,
        validateAndGetAccessTokenClaims
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

        const response = await fetch(url).catch(error => {
            assert(error instanceof Error);
            return error;
        });

        if (response instanceof Error || !response.ok) {
            throw new Error(
                `Failed to fetch openid configuration of the issuerUri: ${issuerUri} (${url}): ${
                    response instanceof Error ? response.message : response.statusText
                }`
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

            assert<Equals<WellKnownConfiguration, z.infer<typeof zWellKnownConfiguration>>>;

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

            assert<Equals<Jwks, z.infer<typeof zJwks>>>;

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

type AccessTokenClaims_JWTPayload = {
    iss: string;
    aud: string | string[];
    exp: number;
    cnf?: {
        jkt?: string;
        [key: string]: unknown;
    };
};

const zAccessTokenClaims_JWTPayload = (() => {
    const zCnf = (() => {
        type TargetType = Exclude<AccessTokenClaims_JWTPayload["cnf"], undefined>;

        const zTargetType = z
            .object({
                jkt: z.string().optional()
            })
            .catchall(z.unknown());

        type InferredType = z.infer<typeof zTargetType>;

        assert<Equals<TargetType, InferredType>>;

        return id<z.ZodType<TargetType>>(zTargetType);
    })();

    type TargetType = AccessTokenClaims_JWTPayload;

    const zTargetType = z.object({
        iss: z.string(),
        aud: z.union([z.string(), z.array(z.string())]),
        exp: z.number(),
        cnf: zCnf.optional()
    });

    type InferredType = z.infer<typeof zTargetType>;

    assert<Equals<TargetType, InferredType>>;

    return id<z.ZodType<TargetType>>(zTargetType);
})();

const zAccessTokenClaims_specs = (() => {
    const zCnf = (() => {
        type TargetType = Exclude<AccessTokenClaims_JWTPayload["cnf"], undefined>;

        const zTargetType = z
            .object({
                jkt: z.string().optional()
            })
            .catchall(z.unknown());

        type InferredType = z.infer<typeof zTargetType>;

        assert<Equals<TargetType, InferredType>>;

        return id<z.ZodType<TargetType>>(zTargetType);
    })();

    type TargetType = AccessTokenClaims_specs;

    const zTargetType = z
        .object({
            scope: z.string().optional(),
            client_id: z.string().optional(),
            exp: z.number().optional(),
            iat: z.number().optional(),
            nbf: z.number().optional(),
            sub: z.string().optional(),
            aud: z.union([z.string(), z.array(z.string())]).optional(),
            iss: z.string().optional(),
            jti: z.string().optional(),
            cnf: zCnf.optional()
        })
        .catchall(z.unknown());

    type InferredType = z.infer<typeof zTargetType>;

    assert<Equals<TargetType, InferredType>>;

    return id<z.ZodType<TargetType>>(zTargetType);
})();
