import { assert, type Equals, objectFromEntries, id, isAmong } from "../vendor/server/tsafe";
import type { IncomingMessage } from "node:http";
import type { HonoRequest } from "hono";
import type { FastifyRequest } from "fastify";
import type { ValidateAndDecodeAccessToken } from "./types";

export type AnyRequest =
    | AnyRequest.Unified
    | AnyRequest.RequestLike
    | AnyRequest.IncomingMessageLike
    | AnyRequest.HonoRequestLike
    | AnyRequest.FastifyRequestLike;

export namespace AnyRequest {
    export type Unified = {
        type: "unified";
        method: string;
        pseudoHeaders: {
            ":scheme": string; // "http" | "https"
            ":authority": string;
            ":path": string;
        };
        headers: Record<
            "Authorization" | "DPoP" | "Forwarded" | "X-Forwarded-Proto" | "X-Forwarded-Host",
            string | undefined
        >;
    };

    export type IncomingMessageLike = {
        headers: {
            [key in string]: string | string[] | undefined;
        };
        method?: string;
        url?: string;
        socket: Record<string, any>;
    };

    assert<IncomingMessage extends IncomingMessageLike ? true : false>;

    export type RequestLike = {
        url: string;
        method: string;
        headers: {
            get: (name: string) => string | null;
        };
    };

    assert<Request extends RequestLike ? true : false>;

    export type HonoRequestLike = {
        raw: RequestLike;
    };

    assert<HonoRequest extends HonoRequestLike ? true : false>;

    export type FastifyRequestLike = {
        raw: IncomingMessageLike;
    };

    assert<FastifyRequest extends FastifyRequestLike ? true : false>;
}

function isUnified(req: AnyRequest): req is AnyRequest.Unified {
    if ("type" in req && req.type === "unified") {
        assert<Equals<typeof req, AnyRequest.Unified>>;
        return true;
    }
    return false;
}

function isRequest(req: AnyRequest): req is AnyRequest.RequestLike {
    // TODO: I would prefer discriminating without instanceof in case the
    // Request object actually match the expected shape but is not an instance
    // of the builtin
    return req instanceof Request;
}

function isIncomingMessage(req: AnyRequest): req is AnyRequest.IncomingMessageLike {
    if ("socket" in req) {
        assert<Equals<typeof req, AnyRequest.IncomingMessageLike>>;
        return true;
    }

    return false;
}

function isHonoRequest(req: AnyRequest): req is AnyRequest.HonoRequestLike {
    if ("raw" in req && isRequest(req.raw)) {
        //assert<Equals<typeof req, AnyRequest.RequestLike>>;
        return true;
    }
    return false;
}
function isFastifyRequest(req: AnyRequest): req is AnyRequest.FastifyRequestLike {
    if ("raw" in req && isIncomingMessage(req.raw)) {
        //assert<Equals<typeof req, AnyRequest.FastifyRequestLike>>;
        return true;
    }
    return false;
}

function anyRequestToUnified(req: AnyRequest): AnyRequest.Unified {
    if (isUnified(req)) {
        return req;
    }

    if (isRequest(req)) {
        const url = new URL(req.url);

        return {
            type: "unified",
            method: req.method,
            pseudoHeaders: {
                ":authority": url.host,
                ":path": `${url.pathname}${url.search}`,
                ":scheme": url.protocol.replace(/:$/, "")
            },
            headers: objectFromEntries(
                (
                    [
                        "Authorization",
                        "DPoP",
                        "Forwarded",
                        "X-Forwarded-Proto",
                        "X-Forwarded-Host"
                    ] as const
                ).map(name => [name, req.headers.get(name) ?? undefined])
            )
        };
    }

    if (isIncomingMessage(req)) {
        const getHeaderValue = (name: string) => {
            const value = req.headers[name.toLowerCase()];
            if (typeof value === "string" && value.length > 0) {
                return value.split(",")[0].trim();
            }
        };

        if (req.method === undefined || req.url === undefined) {
            throw new Error(`oidc-spa: Request not ready`);
        }

        return {
            type: "unified",
            method: req.method,
            pseudoHeaders: {
                ":scheme":
                    getHeaderValue(":scheme") || (req.socket.encrypted === true ? "https" : "http"),
                ":authority": getHeaderValue(":authority") || getHeaderValue("host") || "localhost",
                ":path": req.url
            },
            headers: objectFromEntries(
                (
                    [
                        "Authorization",
                        "DPoP",
                        "Forwarded",
                        "X-Forwarded-Proto",
                        "X-Forwarded-Host"
                    ] as const
                ).map(name => [name, getHeaderValue(name)])
            )
        };
    }

    if (isHonoRequest(req) || isFastifyRequest(req)) {
        return anyRequestToUnified(req.raw);
    }

    assert<Equals<typeof req, never>>(
        false,
        [
            "oidc-spa: The request object provided wasn't parsed correctly",
            "this is a bug in oidc-spa, please open an issue about it",
            "https://github.com/keycloakify/oidc-spa"
        ].join(" ")
    );
}

export type RequestAuthContext = RequestAuthContext.Success | RequestAuthContext.Errored;

export namespace RequestAuthContext {
    export type Success = {
        isWellFormed: true;
        accessTokenAndMetadata: ValidateAndDecodeAccessToken.Params;
    };

    export type Errored = {
        isWellFormed: false;
        debugErrorMessage: string;
    };
}

export function extractRequestAuthContext(params: {
    request: AnyRequest;
    trustProxy: boolean;
}): RequestAuthContext | undefined {
    const { request, trustProxy } = params;

    const request_unified = anyRequestToUnified(request);

    if (request_unified.headers.Authorization === undefined) {
        return undefined;
    }

    const match = request_unified.headers.Authorization.trim().match(/^((?:Bearer)|(?:DPoP))\s+(.+)$/);

    if (match === null) {
        return id<RequestAuthContext.Errored>({
            isWellFormed: false,
            debugErrorMessage: "Malformed Authorization header"
        });
    }

    const [, scheme, accessToken] = match;

    if (!isAmong(["Bearer", "DPoP"], scheme)) {
        return id<RequestAuthContext.Errored>({
            isWellFormed: false,
            debugErrorMessage: `Unsupported scheme ${scheme}, expected Bearer or DPoP`
        });
    }

    if (scheme === "Bearer") {
        return id<RequestAuthContext.Success>({
            isWellFormed: true,
            accessTokenAndMetadata: id<ValidateAndDecodeAccessToken.Params.Bearer>({
                scheme: "Bearer",
                accessToken,
                rejectIfAccessTokenDPoPBound: true
            })
        });
    }

    assert<Equals<typeof scheme, "DPoP">>;

    if (request_unified.headers.DPoP === undefined) {
        return id<RequestAuthContext.Errored>({
            isWellFormed: false,
            debugErrorMessage: "Scheme DPoP was specified but the DPoP header is missing"
        });
    }

    const expectedHtu = (() => {
        const { pseudoHeaders: ps } = request_unified;

        const url = new URL(`${ps[":scheme"]}://${ps[":authority"]}${ps[":path"]}`);

        read_proxy_forwarded_values: {
            if (!trustProxy) {
                break read_proxy_forwarded_values;
            }

            const forwardedParams: { proto: string | undefined; host: string | undefined } = (() => {
                // Reverse proxies may terminate TLS; honor forwarded headers to rebuild the externally visible URL.
                const forwardedHeader = request_unified.headers["Forwarded"];

                if (forwardedHeader === undefined) {
                    return { proto: undefined, host: undefined };
                }

                const [firstEntry] = forwardedHeader.split(",");
                const tokens = firstEntry.trim().split(";");

                const getTokenValue = (name: string) => {
                    const token = tokens.find(token =>
                        token.trim().toLowerCase().startsWith(`${name.toLowerCase()}=`)
                    );

                    if (token === undefined) {
                        return undefined;
                    }

                    const [, rawValue] = token.split("=");

                    return rawValue?.replace(/^"|"$/g, "").trim();
                };

                return {
                    proto: getTokenValue("proto"),
                    host: getTokenValue("host")
                };
            })();

            {
                const forwardedProto = (() => {
                    if (forwardedParams.proto) {
                        return forwardedParams.proto;
                    }

                    const value = request_unified.headers["X-Forwarded-Proto"];

                    if (value === undefined) {
                        return undefined;
                    }

                    return value.split(",")[0]?.trim();
                })();

                const forwardedProto_normalized = (() => {
                    if (forwardedProto === undefined) {
                        return undefined;
                    }

                    const proto = forwardedProto.replace(/:$/, "").toLowerCase();

                    return proto === "http" || proto === "https" ? proto : undefined;
                })();

                if (forwardedProto_normalized !== undefined) {
                    url.protocol = `${forwardedProto_normalized}:`;
                }
            }

            {
                const forwardedHost = (() => {
                    if (forwardedParams.host) {
                        return forwardedParams.host;
                    }

                    const value = request_unified.headers["X-Forwarded-Host"];

                    if (!value) {
                        return undefined;
                    }

                    return value.split(",")[0]?.trim();
                })();

                if (forwardedHost) {
                    url.host = forwardedHost;
                }
            }
        }

        return `${url.origin}${url.pathname}`;
    })();

    return id<RequestAuthContext.Success>({
        isWellFormed: true,
        accessTokenAndMetadata: id<ValidateAndDecodeAccessToken.Params.DPoP>({
            scheme: "DPoP",
            accessToken,
            dpopProof: request_unified.headers.DPoP,
            expectedHtu,
            expectedHtm: request_unified.method
        })
    });
}
