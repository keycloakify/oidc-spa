import { z } from "zod";
import { assert, id, is, type Equals } from "tsafe";

export async function fetchIntrospectionEndpoint(params: { issuerUri: string }): Promise<string> {
    const { issuerUri } = params;
    const discoveryUrl = `${issuerUri.replace(/\/$/, "")}/.well-known/openid-configuration`;

    let response: Response;

    try {
        response = await fetch(discoveryUrl);
    } catch (error) {
        throw new Error(`Failed to fetch ${discoveryUrl}: ${String(error)}`);
    }

    if (!response.ok) {
        throw new Error(
            `Failed to fetch ${discoveryUrl}: HTTP ${response.status} ${response.statusText}`
        );
    }

    let discoveryDocument: unknown;

    try {
        discoveryDocument = await response.json();
    } catch (error) {
        throw new Error(`Failed to parse JSON from ${discoveryUrl}: ${String(error)}`);
    }

    try {
        zOpenIdConfigurationWithIntrospectionEndpoint.parse(discoveryDocument);
    } catch {
        throw new Error(`${discoveryUrl} does not have an introspection_endpoint property`);
    }

    assert(is<OpenIdConfigurationWithIntrospectionEndpoint>(discoveryDocument));

    return discoveryDocument.introspection_endpoint;
}

type OpenIdConfigurationWithIntrospectionEndpoint = {
    introspection_endpoint: string;
};

const zOpenIdConfigurationWithIntrospectionEndpoint = (() => {
    type TargetType = OpenIdConfigurationWithIntrospectionEndpoint;

    const zTargetType = z.object({
        introspection_endpoint: z.string()
    });

    type InferredType = z.infer<typeof zTargetType>;

    assert<Equals<TargetType, InferredType>>;

    return id<z.ZodType<TargetType>>(zTargetType);
})();
