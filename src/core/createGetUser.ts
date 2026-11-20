import type { OidcTokens, CreateUser, OidcProviderMetadata, Oidc, IdTokenClaims } from "./types";
import { assert } from "../tools/tsafe/assert";
import { areDeepEqual } from "../tools/areDeepEqual";
import type { NonPostableEvt } from "../tools/Evt";
import { decodeJwt } from "../tools/decodeJwt";
import { OidcInitializationError } from "./OidcInitializationError";

export function createGetUser<User>(params: {
    issuerUri: string;
    clientId: string;
    validRedirectUri: string;
    createUser: CreateUser<User> | undefined;
    getTokens: () => Promise<OidcTokens>;
    evtTokensChange: NonPostableEvt<void>;
    renewTokens(): Promise<void>;
    oidcProviderMetadata: Pick<OidcProviderMetadata, "userinfo_endpoint">;
}): Pick<Oidc.LoggedIn<User>, "getUser" | "subscribeToUserChange" | "refreshUser"> {
    const {
        issuerUri,
        clientId,
        validRedirectUri,
        createUser,
        getTokens,
        evtTokensChange,
        renewTokens,
        oidcProviderMetadata
    } = params;

    async function fetchUserInfo(params: { accessToken: string }) {
        const { accessToken } = params;

        const { userinfo_endpoint } = oidcProviderMetadata;

        if (!userinfo_endpoint) {
            // TODO: Make a class for this error
            throw new Error("oidc-spa: AS does not expose a userinfo endpoint");
        }

        const r = await fetch(userinfo_endpoint, {
            headers: {
                Authorization: `Bearer ${accessToken}`
            }
        });

        return r.json();
    }

    const onUserChanges = new Set<(params: { user: User; user_previous: User | undefined }) => void>();

    // A separate cache record also allows `undefined` to be a successfully created User.
    let cache: { user: User; hash: string } | undefined;
    let isActivated = false;
    let needsTokenCheck = false;
    let needsTokenRenewal = false;
    let needsUserRecomputation = false;

    // Background work always resolves with an outcome: an unattended token-change event must
    // not produce an unhandled rejection. Public methods apply their own error policies.
    type Outcome = { success: true } | { success: false; error: unknown };
    let prWork: Promise<Outcome> | undefined;
    let prRefresh: Promise<Outcome> | undefined;

    let computation:
        | {
              isCallingCreateUser: boolean;
              timer: ReturnType<typeof setTimeout> | undefined;
              hasWarned: boolean;
          }
        | undefined;

    function checkUserMethod(method: "getUser" | "refreshUser" | "subscribeToUserChange") {
        assert(
            createUser !== undefined,
            `oidc-spa: ${method}() called but no createUser function was provided to createOidc().`
        );

        if (method === "subscribeToUserChange" || computation === undefined) {
            return;
        }

        const explanation = [
            `createUser() must not wait for ${method}(), directly or indirectly,`,
            `because ${method}() waits for createUser() to finish.`,
            "Use the user_current argument to access the previously cached user.",
            "Calling getAccessToken() or getTokens() inside createUser() is supported."
        ].join(" ");

        // Synchronous re-entry is unambiguous. After an await, browsers provide no way to
        // distinguish recursive calls from independent consumers awaiting the same user.
        assert(
            !computation.isCallingCreateUser,
            `oidc-spa: User creation cycle detected. ${explanation}`
        );

        if (computation.timer !== undefined || computation.hasWarned) {
            return;
        }

        const currentComputation = computation;
        // Capture the waiting caller's stack, rather than the timer callback's stack.
        const diagnostic = new Error(
            `oidc-spa: Potential user creation deadlock. ${explanation} ` +
                "An independent caller waiting for a slow createUser() can also trigger this warning."
        );
        currentComputation.timer = setTimeout(() => {
            currentComputation.hasWarned = true;
            console.warn(diagnostic);
        }, 3_000);
    }

    async function computeUser(tokens: OidcTokens): Promise<User> {
        assert(createUser !== undefined);

        const currentComputation = {
            isCallingCreateUser: true,
            timer: undefined as ReturnType<typeof setTimeout> | undefined,
            hasWarned: false
        };
        computation = currentComputation;

        try {
            const result = (() => {
                try {
                    return createUser({
                        accessToken: tokens.accessToken,
                        idTokenClaims: tokens.idTokenClaims,
                        issuerUri,
                        clientId,
                        validRedirectUri,
                        fetchUserInfo: () => fetchUserInfo({ accessToken: tokens.accessToken }),
                        user_current: cache?.user
                    });
                } finally {
                    currentComputation.isCallingCreateUser = false;
                }
            })();

            return await result;
        } catch (error) {
            if (cache !== undefined || error instanceof OidcInitializationError) {
                throw error;
            }

            throw new OidcInitializationError({
                messageOrCause: error instanceof Error ? error : new Error(String(error)),
                isAuthServerLikelyDown: false
            });
        } finally {
            if (currentComputation.timer !== undefined) {
                clearTimeout(currentComputation.timer);
            }
            computation = undefined;
        }
    }

    async function readTokens() {
        // getTokens() may itself renew the tokens. Record the event count with the snapshot
        // so the worker can detect a rotation that races with this asynchronous read.
        const revision = evtTokensChange.postCount;
        const tokens = await getTokens();
        return { tokens, revision };
    }

    async function runWork(): Promise<Outcome> {
        let outcome: Outcome = { success: true };

        try {
            while (needsTokenCheck || needsTokenRenewal || needsUserRecomputation) {
                needsTokenCheck = false;

                try {
                    if (needsTokenRenewal) {
                        // An explicit refresh supersedes a failed computation that was already
                        // running when it was requested. Report failures of this refresh itself.
                        outcome = { success: true };
                        needsTokenRenewal = false;
                        await renewTokens();
                        needsUserRecomputation = true;
                    }

                    const { tokens, revision } = await readTokens();

                    if (revision !== evtTokensChange.postCount || needsTokenRenewal) {
                        needsTokenCheck = true;
                        continue;
                    }

                    needsTokenCheck = false;
                    const hash = computeHash(tokens);

                    if (!needsUserRecomputation && cache !== undefined && cache.hash === hash) {
                        continue;
                    }

                    const user = await computeUser(tokens);

                    // A refresh requested during this computation needs its own token renewal.
                    // Do not publish the result computed before that renewal.
                    if (needsTokenRenewal) {
                        continue;
                    }

                    if (revision !== evtTokensChange.postCount) {
                        const latest = await readTokens();

                        if (
                            latest.revision !== evtTokensChange.postCount ||
                            needsTokenRenewal ||
                            computeHash(latest.tokens) !== hash
                        ) {
                            needsTokenCheck = true;
                            continue;
                        }

                        // A rotation affecting only lifecycle claims does not invalidate this user.
                        needsTokenCheck = false;
                    }

                    needsUserRecomputation = false;
                    const previous = cache;
                    const hasChanged = previous === undefined || !areDeepEqual(user, previous.user);
                    cache = { user: hasChanged ? user : previous.user, hash };

                    if (!hasChanged) {
                        continue;
                    }

                    // Commit before notifying; listener errors must not undo a successful creation
                    // or prevent other subscribers from receiving the update.
                    for (const onUserChange of Array.from(onUserChanges)) {
                        try {
                            onUserChange({ user, user_previous: previous?.user });
                        } catch (error) {
                            console.error("oidc-spa: A subscribeToUserChange callback threw.", error);
                        }
                    }
                } catch (error) {
                    needsUserRecomputation = false;
                    outcome = { success: false, error };

                    if (cache !== undefined) {
                        console.error(
                            "oidc-spa: Could not refresh the user; keeping the last successfully created user.",
                            error
                        );
                    }
                }
            }

            return outcome;
        } finally {
            prWork = undefined;
            prRefresh = undefined;
        }
    }

    function ensureWork(): Promise<Outcome> {
        // Install the shared promise before invoking any application code or token API.
        return (prWork ??= Promise.resolve().then(runWork));
    }

    const subscribeToUserChange: Oidc.LoggedIn<User>["subscribeToUserChange"] = onUserChange => {
        checkUserMethod("subscribeToUserChange");
        onUserChanges.add(onUserChange);

        return {
            unsubscribeFromUserChange: () => {
                onUserChanges.delete(onUserChange);
            }
        };
    };

    const refreshUser: Oidc.LoggedIn<User>["refreshUser"] = async () => {
        checkUserMethod("refreshUser");
        isActivated = true;

        if (prRefresh === undefined) {
            needsTokenRenewal = true;
            prRefresh = ensureWork();
        }

        const outcome = await prRefresh;

        if (!outcome.success) {
            throw outcome.error;
        }
    };

    const getUser: Oidc.LoggedIn<User>["getUser"] = async () => {
        checkUserMethod("getUser");
        isActivated = true;

        if (cache === undefined && prWork === undefined) {
            needsTokenCheck = true;
            ensureWork();
        }

        let outcome: Outcome = { success: true };

        // Another refresh may have started just as the previous worker completed.
        while (prWork !== undefined) {
            outcome = await prWork;
        }

        if (cache !== undefined) {
            return cache.user;
        }

        assert(!outcome.success);
        throw outcome.error;
    };

    evtTokensChange.subscribe(() => {
        if (!isActivated) {
            return;
        }

        needsTokenCheck = true;

        if (prWork !== undefined) {
            return;
        }

        // Never await user creation from the token event handler: createUser is allowed to
        // await getAccessToken/getTokens, including when those methods trigger a renewal.
        void ensureWork().then(outcome => {
            if (!outcome.success && cache === undefined) {
                console.error(
                    "oidc-spa: Could not initialize the user after token renewal.",
                    outcome.error
                );
            }
        });
    });

    return { getUser, subscribeToUserChange, refreshUser };
}

function computeHash(params: { idTokenClaims: IdTokenClaims; accessToken: string }): string {
    const { idTokenClaims, accessToken } = params;

    const decodedIdToken_stableish = (() => {
        const { exp, iat, nonce, ...rest } = idTokenClaims;

        return rest;
    })();

    const decodedAccessToken_stableish = (() => {
        let decodedAccessToken: Record<string, unknown>;

        try {
            decodedAccessToken = decodeJwt(accessToken);

            if (
                decodedAccessToken === null ||
                typeof decodedAccessToken !== "object" ||
                Array.isArray(decodedAccessToken)
            ) {
                return undefined;
            }
        } catch {
            return undefined;
        }

        const { exp, iat, jti, nbf, cnf, ...rest } = decodedAccessToken;

        return rest;
    })();

    // Canonicalize object keys at every depth while preserving array order. Use a null
    // prototype so even a claim named "__proto__" is serialized as an ordinary property.
    const stringify = (obj: Record<string, unknown>) =>
        JSON.stringify(obj, (_key, value: unknown) => {
            if (value === null || typeof value !== "object" || Array.isArray(value)) {
                return value;
            }

            const sorted: Record<string, unknown> = Object.create(null);

            for (const key of Object.keys(value).sort()) {
                sorted[key] = (value as Record<string, unknown>)[key];
            }

            return sorted;
        });

    return [
        stringify(decodedIdToken_stableish),
        "|",
        decodedAccessToken_stableish === undefined ? "" : stringify(decodedAccessToken_stableish)
    ].join("");
}
