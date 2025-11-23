import { assert } from "../tools/tsafe/assert";

let isTokenSubstitutionEnabled = false;

export function markTokenSubstitutionAdEnabled() {
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
    tokens: Tokens;
    id: number;
}[] = [];

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

    const entry_new = {
        id,
        configId,
        tokens
    };

    entries.push(entry_new);

    return {
        accessToken: `access_token_placeholder_${id}`,
        idToken: `id_token_placeholder_${id}`,
        refreshToken: tokens.refreshToken === undefined ? undefined : `refresh_token_placeholder_${id}`
    };
}

export function substitutePlaceholderByRealToken(text: string): string {
    let text_modified = text;

    for (const [tokenType, regExp] of [
        ["access_token", /access_token_placeholder_(\d+)/g],
        ["id_token", /id_token_placeholder_(\d+)/g],
        ["refresh_token", /refresh_token_placeholder_(\d+)/g]
    ] as const) {
        text_modified = text_modified.replace(regExp, (...[, p1]) => {
            const id = parseInt(p1);

            const entry = entries.find(e => e.id === id);

            if (!entry) {
                throw new Error(
                    [
                        "oidc-spa: Outdated token used to make a request.",
                        "Token should not be stored at the application level, when a token",
                        "is needed, it should be requested and used immediately."
                    ].join(" ")
                );
            }

            switch (tokenType) {
                case "access_token":
                    return entry.tokens.accessToken;
                case "id_token":
                    return entry.tokens.idToken;
                case "refresh_token":
                    assert(entry.tokens.refreshToken !== undefined, "204392284");
                    return entry.tokens.refreshToken;
            }
        });
    }

    return text_modified;
}
