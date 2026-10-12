import { createLocalJWKSet } from "../../vendor/server/jose";
import { assert, type Equals, is } from "tsafe";
import { z } from "zod";

export type PublicSigningKeys = {
    keyResolver: ReturnType<typeof createLocalJWKSet>;
    kidSet: Set<string>;
};

export async function fetchPublicSigningKeys(params: { issuerUri: string }): Promise<PublicSigningKeys> {
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
