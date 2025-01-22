import { assert } from "../vendor/frontend/tsafe";
import { addQueryParamToUrl, retrieveQueryParamFromUrl } from "../tools/urlQueryParams";
import { decodeJwt } from "../tools/decodeJwt";
import { encodeBase64, decodeBase64 } from "../tools/base64";
import type { HybridStorage } from "../tools/HybridStorage";
import type { ParamsOfCreateOidc } from "./createOidc";
import { getConfigHash } from "./configHash";

export async function maybeImpersonate(params: {
    configHash: string;
    getDoContinueWithImpersonation: Exclude<
        ParamsOfCreateOidc["getDoContinueWithImpersonation"],
        undefined
    >;
    store: HybridStorage;
    log: typeof console.log | undefined;
}) {
    const { configHash, getDoContinueWithImpersonation, store, log } = params;

    const QUERY_PARAM_NAME = "oidc-spa_impersonate";

    const result = retrieveQueryParamFromUrl({
        "url": window.location.href,
        "name": QUERY_PARAM_NAME
    });

    if (!result.wasPresent) {
        return;
    }

    type ParsedValue = {
        idToken: string;
        accessToken: string;
        refreshToken: string;
    }[];

    function isParsedValue(value: unknown): value is ParsedValue {
        if (!Array.isArray(value)) {
            return false;
        }

        return value.every(item => {
            return (
                typeof item === "object" &&
                item !== null &&
                typeof (item as Record<string, unknown>).idToken === "string" &&
                typeof (item as Record<string, unknown>).accessToken === "string" &&
                typeof (item as Record<string, unknown>).refreshToken === "string"
            );
        });
    }

    const parsedValue = JSON.parse(decodeBase64(result.value));

    assert(isParsedValue(parsedValue));

    log?.("Impersonation params got:", parsedValue);

    let match:
        | {
              parsedStoreValue: {
                  id_token: string;
                  session_state: string;
                  access_token: string;
                  refresh_token: string;
                  token_type: "Bearer";
                  scope: string;
                  profile: Record<string, unknown>;
                  expires_at: number;
              };
              parsedAccessToken: Record<string, unknown>;
              issuerUri: string;
              clientId: string;
              index: number;
          }
        | undefined = undefined;

    for (let index = 0; index < parsedValue.length; index++) {
        const { idToken, accessToken, refreshToken } = parsedValue[index];

        const parsedAccessToken = decodeJwt(accessToken) as any;

        assert(parsedAccessToken instanceof Object);
        const { iss, azp, sid, scope, exp } = parsedAccessToken;
        assert(typeof iss === "string");
        assert(typeof azp === "string");

        const issuerUri = iss;
        const clientId = azp;

        if (getConfigHash({ issuerUri, clientId }) !== configHash) {
            continue;
        }

        assert(typeof sid === "string");
        assert(typeof scope === "string");
        assert(typeof exp === "number");

        log?.("Impersonation confirmed, storing the impersonation params in the session storage");

        assert(match === undefined, "More than one impersonation params matched the current config");

        match = {
            parsedStoreValue: {
                "id_token": idToken,
                "session_state": sid,
                "access_token": accessToken,
                "refresh_token": refreshToken,
                "token_type": "Bearer",
                scope,
                "profile": parsedAccessToken,
                "expires_at": exp
            },
            parsedAccessToken,
            issuerUri,
            clientId,
            index
        };
    }

    if (match === undefined) {
        return;
    }

    // Clean up the url
    {
        parsedValue.splice(match.index, 1);

        let url = window.location.href;

        if (parsedValue.length === 0) {
            const result = retrieveQueryParamFromUrl({
                url,
                name: QUERY_PARAM_NAME
            });

            assert(result.wasPresent);

            url = result.newUrl;
        } else {
            const { newUrl } = addQueryParamToUrl({
                url,
                name: QUERY_PARAM_NAME,
                value: encodeBase64(JSON.stringify(parsedValue))
            });

            url = newUrl;
        }

        window.history.replaceState(null, "", url);
    }

    log?.(
        "Impersonation param matched with the current configuration, asking for confirmation before continuing"
    );

    const doContinue = await getDoContinueWithImpersonation({
        parsedAccessToken: match.parsedAccessToken
    });

    if (!doContinue) {
        log?.("Impersonation was canceled by the user");
        return;
    }

    store.setItem_persistInSessionStorage(
        `oidc.user:${match.issuerUri}:${match.clientId}`,
        JSON.stringify(match.parsedStoreValue)
    );
}
