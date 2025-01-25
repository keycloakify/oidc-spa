import { assert } from "../vendor/frontend/tsafe";
import { addQueryParamToUrl, retrieveQueryParamFromUrl } from "../tools/urlQueryParams";
import { decodeJwt } from "../tools/decodeJwt";
import { encodeBase64, decodeBase64 } from "../tools/base64";
import type { HybridStorage } from "../tools/HybridStorage";
import type { ParamsOfCreateOidc } from "./createOidc";
import { toFullyQualifiedUrl } from "../tools/toFullyQualifiedUrl";

type ImpersonationParams = {
    clientId?: string;
    idToken: string;
    accessToken: string;
    refreshToken: string;
};

function getIsImpersonationParams(value: any): value is ImpersonationParams {
    // TODO
    return value instanceof Object;
}

type ParsedQueryParamValue = ImpersonationParams[] | ImpersonationParams;

function getIsParsedQueryParamValue(value: any): value is ParsedQueryParamValue {
    if (Array.isArray(value)) {
        return value.every(getIsImpersonationParams);
    }
    return getIsImpersonationParams(value);
}

const QUERY_PARAM_NAME = "oidc-spa_impersonate";

export async function maybeImpersonate<DecodedIdToken extends Record<string, unknown>>(params: {
    clientId: string;
    issuerUri: string;
    decodedIdTokenSchema: ParamsOfCreateOidc<DecodedIdToken>["decodedIdTokenSchema"];
    getDoContinueWithImpersonation: Exclude<
        ParamsOfCreateOidc<DecodedIdToken>["getDoContinueWithImpersonation"],
        undefined
    >;
    store: HybridStorage;
    log: typeof console.log | undefined;
}) {
    const { clientId, issuerUri, decodedIdTokenSchema, getDoContinueWithImpersonation, store, log } =
        params;

    const result = retrieveQueryParamFromUrl({
        url: window.location.href,
        name: QUERY_PARAM_NAME
    });

    if (!result.wasPresent) {
        return;
    }

    let parsedQueryParmValue: unknown | undefined = undefined;

    try {
        parsedQueryParmValue = JSON.parse(decodeBase64(result.value));
    } catch {
        throw new Error(
            [
                "An impersonation query param was found in the url but it was not a valid base64 encoded JSON",
                `${QUERY_PARAM_NAME}=${result.value}`
            ].join("\n")
        );
    }

    if (!getIsParsedQueryParamValue(parsedQueryParmValue)) {
        throw new Error(
            [
                "An impersonation query param was found in the url but, once parsed, it was not of the expected shape",
                ``,
                `What we got was:`,
                JSON.stringify(parsedQueryParmValue, null, 2),
                ``,
                `We expected:`,
                `type ImpersonationParams = {`,
                `    clientId?: string;`,
                `    idToken: string;`,
                `    accessToken: string;`,
                `    refreshToken: string;`,
                `};`,
                ``,
                `type ParsedQueryParamValue = ImpersonationParams[] | ImpersonationParams;`
            ].join("\n")
        );
    }

    const impersonationParamsEntries =
        parsedQueryParmValue instanceof Array ? parsedQueryParmValue : [parsedQueryParmValue];

    /*
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
              index: number;
          }
        | undefined = undefined;
    */

    let matchedIndex: number | undefined = undefined;

    for (let index = 0; index < impersonationParamsEntries.length; index++) {
        const { clientId: clientId_explicitlyProvided, idToken } = impersonationParamsEntries[index];

        let decodedIdToken: Record<string, unknown>;

        try {
            decodedIdToken = decodeJwt(idToken);
        } catch {
            throw new Error(
                `The idToken provided in the impersonation params is not a valid JWT: ${idToken}`
            );
        }

        const { iss } = decodedIdToken;

        if (typeof iss !== "string") {
            throw new Error(
                `The idToken provided in the impersonation params does not have a valid issuer (iss claim): ${JSON.stringify(
                    decodedIdToken
                )}`
            );
        }

        if (toFullyQualifiedUrl({ urlish: iss, doAssertNoQueryParams: false }) !== issuerUri) {
            continue;
        }

        const isMatchingClientId = (() => {
            if (clientId_explicitlyProvided !== undefined && clientId_explicitlyProvided === clientId) {
                return true;
            }

            check_explicitlyProvidedClientId: {
                if (clientId_explicitlyProvided === undefined) {
                    break check_explicitlyProvidedClientId;
                }

                return clientId_explicitlyProvided === clientId;
            }

            let hadWayToCheck = false;

            check_azp: {
                const { azp } = decodedIdToken;

                if (typeof azp !== "string") {
                    // NOTE: It's supposed to be required by the spec but whatever
                    break check_azp;
                }

                hadWayToCheck = true;

                if (azp !== clientId) {
                    break check_azp;
                }

                return true;
            }

            check_aud: {
                const { aud } = decodedIdToken;

                if (
                    !(typeof aud === "string") &&
                    !(aud instanceof Array && aud.every(entry => typeof entry === "string"))
                ) {
                    break check_aud;
                }

                hadWayToCheck = true;

                const audienceEntries = typeof aud === "string" ? [aud] : aud;

                if (!audienceEntries.includes(clientId)) {
                    break check_aud;
                }

                return true;
            }

            if (!hadWayToCheck) {
                throw new Error(
                    [
                        "We had no way to match the impersonation params with an oidc-spa instance.",
                        "Either explicitly provide the clientId in the impersonation params or make sure",
                        "the idToken has a valid azp or aud claim."
                    ].join(" ")
                );
            }

            return false;
        })();

        if (!isMatchingClientId) {
            continue;
        }

        if (matchedIndex !== undefined) {
            throw new Error(
                [
                    "More than one impersonation params matched the current config",
                    "This is not supported.",
                    JSON.stringify({ issuerUri, clientId })
                ].join(" ")
            );
        }

        matchedIndex = index;
    }

    if (matchedIndex === undefined) {
        return;
    }

    const impersonationParams = impersonationParamsEntries[matchedIndex];

    // Clean up the url
    {
        impersonationParamsEntries.splice(matchedIndex, 1);

        let url = window.location.href;

        if (impersonationParamsEntries.length === 0) {
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
                value: encodeBase64(JSON.stringify(impersonationParamsEntries))
            });

            url = newUrl;
        }

        window.history.replaceState(null, "", url);
    }

    const decodedIdToken_original = decodeJwt(impersonationParams.idToken);

    const decodedIdToken = (() => {
        if (decodedIdTokenSchema === undefined) {
            return decodedIdToken_original as DecodedIdToken;
        }

        try {
            return decodedIdTokenSchema.parse(decodedIdToken_original);
        } catch (error) {
            throw new Error(
                "Decoded id token does not match the expected schema",
                //@ts-expect-error
                { cause: error }
            );
        }
    })();

    log?.("Asking the user for confirmation to continue with the impersonation");

    const doContinue = await getDoContinueWithImpersonation({
        decodedIdToken,
        accessToken: impersonationParams.accessToken
    });

    if (!doContinue) {
        log?.("Impersonation was canceled by the user");
        return;
    }

    const decodedAccessToken = decodeJwt(impersonationParams.accessToken) as any;

    store.setItem_persistInSessionStorage(
        `oidc.user:${issuerUri}:${clientId}`,
        JSON.stringify({
            id_token: impersonationParams.idToken,
            session_state: decodedAccessToken.sid,
            access_token: impersonationParams.accessToken,
            refresh_token: impersonationParams.refreshToken,
            token_type: "Bearer",
            scope: decodedAccessToken.scope,
            profile: decodedAccessToken,
            expires_at: decodedAccessToken.exp
        })
    );
}
