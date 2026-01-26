import type { Oidc } from "./Oidc";
import { decodeJwt } from "../tools/decodeJwt";
import { id } from "../tools/tsafe/id";
import { assert } from "../tools/tsafe/assert";
import type { MaybeAsync } from "../tools/MaybeAsync";
import { Deferred } from "../tools/Deferred";

export function createGetUser<User>(params: {
    issuerUri: string;
    //createUser: ParamsOfCreateOidc["createUser"];
    createUser:
        | ((params: {
              decodedIdToken: Oidc.Tokens.DecodedIdToken_OidcCoreSpec;
              accessToken: string;
              fetchUserInfo: () => Promise<{
                  [key: string]: unknown;
                  sub: string;
              }>;
              issuerUri: string;
          }) => MaybeAsync<User>)
        | undefined;
    getTokens: () => Promise<Oidc.Tokens>;
    subscribeToTokensChange: (onTokenChange: (tokens: Oidc.Tokens) => void) => void;
    renewTokens(): Promise<void>;
    oidcMetadata: {
        userinfo_endpoint?: string;
    };
}) {
    const { issuerUri, createUser, getTokens, subscribeToTokensChange, renewTokens, oidcMetadata } =
        params;

    type GetUser = Oidc.LoggedIn<any, User>["getUser"];

    type R_GetUser = Awaited<ReturnType<GetUser>>;

    async function fetchUserInfo(params: { accessToken: string }) {
        const { accessToken } = params;

        const { userinfo_endpoint } = oidcMetadata;

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

    let state: { prUser: Promise<User>; hash: string } | undefined = undefined;

    const onUserChanges = new Set<(params: { user: User; user_previous: User | undefined }) => void>();

    const subscribeToUserChange: R_GetUser["subscribeToUserChange"] = onUserChange => {
        onUserChanges.add(onUserChange);

        return {
            unsubscribeFromUserChange: () => {
                onUserChanges.delete(onUserChange);
            }
        };
    };

    function __updatePrUserIfHashChanged() {
        assert(createUser !== undefined, "94302");

        const hash_current = state?.hash;

        const hash_new = computeHash({
            accessToken: tokens.accessToken,
            decodedIdToken: tokens.decodedIdToken
        });

        const prUser_new = (async () => {
            const tokens = await getTokens();

            const prUser_current = state?.prUser;

            if (hash_current === hash_new) {
                assert(prUser_current !== undefined);
                return prUser_current;
            }

            const user_new = await createUser({
                accessToken: tokens.accessToken,
                decodedIdToken: tokens.decodedIdToken_original,
                issuerUri,
                fetchUserInfo: () => fetchUserInfo({ accessToken: tokens.accessToken })
            });

            {
                const user_current = await prUser_current;

                onUserChanges.forEach(onUserChange =>
                    onUserChange({
                        user: user_new,
                        user_previous: user_current
                    })
                );
            }

            return user_new;
        })();

        state = {
            hash: hash_new,
            prUser: prUser_new
        };
    }

    const refreshUser: R_GetUser["refreshUser"] = async () => {
        if (state !== undefined) {
            state.hash = "";
        }

        renewTokens();
    };

    subscribeToTokensChange(tokens => {});

    const getUser: GetUser = async () => {
        if (prUser === undefined) {
            if (createUser === undefined) {
                throw new Error("oidc-spa: createUser not provided");
            }

            __updatePrUser();

            assert(prUser !== undefined);
        }

        const user = await prUser;

        return id<R_GetUser>({
            user,
            refreshUser,
            subscribeToUserChange
        });
    };

    return { getUser };
}

function computeHash(params: {
    decodedIdToken: Oidc.Tokens.DecodedIdToken_OidcCoreSpec;
    accessToken: string;
}): string {}
