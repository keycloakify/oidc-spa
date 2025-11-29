import { assert } from "../tools/tsafe/assert";

let isTokenSubstitutionEnabled = false;

export function markTokenSubstitutionAsEnabled() {
    isTokenSubstitutionEnabled = true;
}

export function getIsTokenSubstitutionEnabled() {
    return isTokenSubstitutionEnabled;
}

type Tokens = {
    accessToken: string;
    idToken: string;
    refreshToken?: string;
};

const entries: {
    configId: string;
    id: number;
    tokens: Tokens;
    tokens_placeholder: Tokens;
}[] = [];

function generatePlaceholderForToken(params: {
    tokenType: "id_token" | "access_token" | "refresh_token";
    token_real: string;
    id: number;
}): string {
    const { tokenType, token_real, id } = params;

    const match = token_real.match(/^([A-Za-z0-9\-_]+)\.([A-Za-z0-9\-_]+)\.([A-Za-z0-9\-_]+)$/);

    if (match === null) {
        assert(tokenType !== "id_token", "39232932927");
        return `${tokenType}_placeholder_${id}`;
    }

    const [, header_b64, payload_b64, signature_b64] = match;

    const signatureByteLength = (() => {
        const b64 = signature_b64
            .replace(/-/g, "+")
            .replace(/_/g, "/")
            .padEnd(Math.ceil(signature_b64.length / 4) * 4, "=");

        const padding = b64.endsWith("==") ? 2 : b64.endsWith("=") ? 1 : 0;
        return (b64.length * 3) / 4 - padding;
    })();

    const targetSigB64Length = Math.ceil((signatureByteLength * 4) / 3);

    const sig_placeholder = (function makeZeroPaddedBase64UrlString(
        targetLength: number,
        seed: string
    ): string {
        const PAD = "A";

        let out = seed.slice(0, targetLength);

        if (out.length < targetLength) {
            out = out + PAD.repeat(targetLength - out.length);
        }

        if (out.length % 4 === 1) {
            out = out.slice(0, -1) + PAD;
        }

        return out;
    })(targetSigB64Length, `sig_placeholder_${id}_`);

    return `${header_b64}.${payload_b64}.${sig_placeholder}`;
}

let counter = Math.floor(Math.random() * 1_000_000) + 1_000_000;

export function getTokensPlaceholders(params: { configId: string; tokens: Tokens }): Tokens {
    const { configId, tokens } = params;

    assert(isTokenSubstitutionEnabled, "2934482");

    for (const entry of entries) {
        if (entry.configId !== configId) {
            continue;
        }

        setTimeout(() => {
            const index = entries.indexOf(entry);

            if (index === -1) {
                return;
            }

            entries.splice(index, 1);
        }, 30_000);
    }

    const id = counter++;

    const entry_new: (typeof entries)[number] = {
        configId,
        id,
        tokens: {
            idToken: tokens.idToken,
            accessToken: tokens.accessToken,
            refreshToken: tokens.refreshToken
        },
        tokens_placeholder: {
            idToken: generatePlaceholderForToken({
                tokenType: "id_token",
                id,
                token_real: tokens.idToken
            }),
            accessToken: generatePlaceholderForToken({
                tokenType: "access_token",
                id,
                token_real: tokens.accessToken
            }),
            refreshToken:
                tokens.refreshToken === undefined
                    ? undefined
                    : generatePlaceholderForToken({
                          tokenType: "refresh_token",
                          id,
                          token_real: tokens.refreshToken
                      })
        }
    };

    entries.push(entry_new);

    return entry_new.tokens_placeholder;
}

export function substitutePlaceholderByRealToken(text: string): string {
    // NOTE: Extra check to make sure we didn't made an error upstream
    // we want to know for sure this isn't an attacker crafted object.
    assert(typeof text === "string", "394833403");

    if (!text.includes("_placeholder_")) {
        return text;
    }

    let text_modified = text;

    for (const entry of entries) {
        if (!text.includes(`${entry.id}`)) {
            continue;
        }

        for (const tokenType of ["idToken", "accessToken", "refreshToken"] as const) {
            const placeholder = entry.tokens_placeholder[tokenType];

            if (tokenType === "refreshToken") {
                if (placeholder === undefined) {
                    continue;
                }
            }
            assert(placeholder !== undefined, "023948092393");

            const realToken = entry.tokens[tokenType];

            assert(realToken !== undefined, "02394809239328");

            text_modified = text_modified.split(placeholder).join(realToken);
        }
    }

    return text_modified;
}
