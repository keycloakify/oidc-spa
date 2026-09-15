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
    errors,
    importJWK,
    calculateJwkThumbprint,
    base64url
} from "../vendor/server/jose";
import { assert, isAmong, id, type Equals, is } from "../vendor/server/tsafe";
import { z } from "../vendor/server/zod";
import { Evt, throttleTime } from "../vendor/server/evt";
import { decodeJwt } from "../tools/decodeJwt";
import { fetchPublicSigningKeys, type PublicSigningKeys } from "./tools/fetchPublicSigningKeys";
import { fetchIntrospectionEndpoint } from "./tools/fetchIntrospectionEndpoint";

export function createOidcSpaUtils<AccessTokenClaims>(params: {
    accessTokenClaimsSchema: ZodSchemaLike<AccessTokenClaims_specs, AccessTokenClaims> | undefined;
}): OidcSpaUtils<AccessTokenClaims> {
    const { accessTokenClaimsSchema } = params;

    const dParamsOfBootstrap = new Deferred<ParamsOfBootstrap<AccessTokenClaims>>();

    const { getIntrospectionEndpoint } = (() => {
        let prIntrospectionEndpoint: Promise<string> | undefined;

        async function getIntrospectionEndpoint(
            params: ParamsOfBootstrap.Real.TokenIntrospectionEndpoint
        ): Promise<string> {
            if (prIntrospectionEndpoint === undefined) {
                const pr = fetchIntrospectionEndpoint({ issuerUri: params.issuerUri });

                prIntrospectionEndpoint = pr;

                try {
                    return await pr;
                } catch (error) {
                    if (prIntrospectionEndpoint === pr) {
                        prIntrospectionEndpoint = undefined;
                    }

                    throw error;
                }
            }

            return await prIntrospectionEndpoint;
        }

        return { getIntrospectionEndpoint };
    })();

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
                            const { expectedAccessTokenAudience } = paramsOfBootstrap;

                            if (expectedAccessTokenAudience === undefined) {
                                break validate_audience;
                            }

                            const audiences =
                                accessTokenClaims_original.aud instanceof Array
                                    ? accessTokenClaims_original.aud
                                    : [accessTokenClaims_original.aud];

                            if (!audiences.includes(expectedAccessTokenAudience)) {
                                return id<ValidateAndGetAccessTokenClaims.ReturnType.Errored>({
                                    isSuccess: false,
                                    debugErrorMessage: [
                                        `Not expected audience, got aud claim ${JSON.stringify(
                                            accessTokenClaims_original.aud
                                        )}`,
                                        `but expected "${expectedAccessTokenAudience}".`
                                    ].join(" ")
                                });
                            }
                        }
                    }
                    break;
                case "introspection endpoint":
                    {
                        const { clientId, clientSecret, issuerUri } = paramsOfBootstrap;

                        let introspectionEndpoint: string;

                        try {
                            introspectionEndpoint = await getIntrospectionEndpoint(paramsOfBootstrap);
                        } catch (error) {
                            return id<ValidateAndGetAccessTokenClaims.ReturnType.Errored>({
                                isSuccess: false,
                                debugErrorMessage: `Could not resolve the token introspection endpoint: ${String(
                                    error
                                )}`
                            });
                        }

                        let response: Response;

                        {
                            const basicAuthorization = (() => {
                                const formEncode = (value: string) =>
                                    new URLSearchParams({ value }).toString().slice("value=".length);

                                return btoa(`${formEncode(clientId)}:${formEncode(clientSecret)}`);
                            })();

                            try {
                                response = await fetch(introspectionEndpoint, {
                                    method: "POST",
                                    headers: {
                                        Accept: "application/json",
                                        "Content-Type": "application/x-www-form-urlencoded",
                                        Authorization: `Basic ${basicAuthorization}`
                                    },
                                    body: new URLSearchParams({
                                        token: params.accessToken,
                                        token_type_hint: "access_token"
                                    })
                                });
                            } catch (error) {
                                return id<ValidateAndGetAccessTokenClaims.ReturnType.Errored>({
                                    isSuccess: false,
                                    debugErrorMessage: `Token introspection request failed: ${String(
                                        error
                                    )}`
                                });
                            }
                        }

                        if (!response.ok) {
                            return id<ValidateAndGetAccessTokenClaims.ReturnType.Errored>({
                                isSuccess: false,
                                debugErrorMessage: `Token introspection request failed with HTTP ${response.status} ${response.statusText}`
                            });
                        }

                        let introspectionResponse: unknown;

                        try {
                            introspectionResponse = await response.json();
                        } catch (error) {
                            return id<ValidateAndGetAccessTokenClaims.ReturnType.Errored>({
                                isSuccess: false,
                                debugErrorMessage: `Failed to parse token introspection response: ${String(
                                    error
                                )}`
                            });
                        }

                        try {
                            zTokenIntrospectionResponse.parse(introspectionResponse);
                        } catch (error) {
                            assert(error instanceof Error, "12716391");

                            return id<ValidateAndGetAccessTokenClaims.ReturnType.Errored>({
                                isSuccess: false,
                                debugErrorMessage: `Invalid token introspection response: ${error.message}`
                            });
                        }

                        assert(is<TokenIntrospectionResponse>(introspectionResponse));

                        const { active, ...claimsFromIntrospectionResponse } = introspectionResponse;

                        if (!active) {
                            return id<ValidateAndGetAccessTokenClaims.ReturnType.Errored>({
                                isSuccess: false,
                                debugErrorMessage: "Access token is inactive"
                            });
                        }

                        accessTokenClaims_original = claimsFromIntrospectionResponse;

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

                        if (accessTokenClaims_original.iss !== undefined) {
                            const normalize = (issuerUri: string) => issuerUri.replace(/\/$/, "");

                            if (normalize(accessTokenClaims_original.iss) !== normalize(issuerUri)) {
                                return id<ValidateAndGetAccessTokenClaims.ReturnType.Errored>({
                                    isSuccess: false,
                                    debugErrorMessage: [
                                        `iss claim in token introspection response "${accessTokenClaims_original.iss}"`,
                                        `does not match the issuerUri "${issuerUri}".`
                                    ].join(" ")
                                });
                            }
                        }
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

type TokenIntrospectionResponse = {
    active: boolean;
    [key: string]: unknown;
};

const zTokenIntrospectionResponse = (() => {
    type TargetType = TokenIntrospectionResponse;

    const zTargetType = z
        .object({
            active: z.boolean()
        })
        .catchall(z.unknown());

    type InferredType = z.infer<typeof zTargetType>;

    assert<Equals<TargetType, InferredType>>;

    return id<z.ZodType<TargetType>>(zTargetType);
})();
