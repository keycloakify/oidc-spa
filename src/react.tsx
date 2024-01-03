import {
    useEffect,
    useState,
    createContext,
    useContext,
    useReducer,
    useMemo,
    type ReactNode
} from "react";
import { createOidc, type Oidc } from "./oidc";
import { assert } from "tsafe/assert";
import { decodeJwt } from "./tools/decodeJwt";
import { id } from "tsafe/id";

const oidcContext = createContext<Oidc | undefined>(undefined);

/** @see: https://github.com/garronej/oidc-spa#option-2-usage-directly-within-react */
export function createOidcProvider(params: Parameters<typeof createOidc>[0]) {
    const prOidc = createOidc(params);

    function OidcProvider(props: { fallback?: ReactNode; children: ReactNode }) {
        const { children, fallback } = props;

        const [oidc, setOidc] = useState<Oidc | undefined>(undefined);

        useEffect(() => {
            prOidc.then(setOidc);
        }, []);

        if (oidc === undefined) {
            return <>{fallback === undefined ? null : fallback}</>;
        }

        return <oidcContext.Provider value={oidc}>{children}</oidcContext.Provider>;
    }

    return { OidcProvider, prOidc };
}

export type ReactiveOidc<DecodedIdToken extends Record<string, unknown>> =
    | ReactiveOidc.NotLoggedIn
    | ReactiveOidc.LoggedIn<DecodedIdToken>;

export namespace ReactiveOidc {
    export type Common = Oidc.Common;

    export type NotLoggedIn = Common & {
        isUserLoggedIn: false;
        login: Oidc.NotLoggedIn["login"];
        oidcTokens: undefined;
        logout: undefined;
    };

    export type LoggedIn<DecodedIdToken extends Record<string, unknown>> = Common & {
        isUserLoggedIn: true;
        oidcTokens: ReturnType<Oidc.LoggedIn["getTokens"]> & {
            decodedIdToken: DecodedIdToken;
        };
        logout: Oidc.LoggedIn["logout"];
        renewTokens: Oidc.LoggedIn["renewTokens"];
        login: undefined;
    };
}

export function createUseOidc<
    DecodedOidcIdToken extends Record<string, unknown> = Record<string, unknown>
>(params?: { decodedIdTokenSchema?: { parse: (data: unknown) => DecodedOidcIdToken } }) {
    const { decodedIdTokenSchema } = params ?? {};

    function useOidc(params?: { assertUserLoggedIn: false }): ReactiveOidc<DecodedOidcIdToken>;
    function useOidc(params: { assertUserLoggedIn: true }): ReactiveOidc.LoggedIn<DecodedOidcIdToken>;
    function useOidc(params?: { assertUserLoggedIn: boolean }): ReactiveOidc<DecodedOidcIdToken> {
        const { assertUserLoggedIn = false } = params ?? {};

        const oidc = useContext(oidcContext);

        assert(oidc !== undefined, "You must use useOidc inside a OidcProvider");

        const [, forceUpdate] = useReducer(() => [], []);

        useEffect(() => {
            if (!oidc.isUserLoggedIn) {
                return;
            }

            const { unsubscribe } = oidc.subscribeToTokensChange(forceUpdate);

            return unsubscribe;
        }, [oidc]);

        if (assertUserLoggedIn && !oidc.isUserLoggedIn) {
            throw new Error(
                "The user must be logged in to use this hook (assertUserLoggedIn was set to true)"
            );
        }

        const tokens = oidc.isUserLoggedIn ? oidc.getTokens() : undefined;

        const decodedIdToken = useMemo(() => {
            if (tokens?.idToken === undefined) {
                return undefined;
            }

            const decodedIdToken = decodeJwt(tokens.idToken) as DecodedOidcIdToken;

            if (decodedIdTokenSchema !== undefined) {
                decodedIdTokenSchema.parse(decodeJwt(tokens.idToken));
            }

            return decodedIdToken;
        }, [tokens?.idToken]);

        const common: ReactiveOidc.Common = {
            "params": oidc.params
        };

        return oidc.isUserLoggedIn
            ? id<ReactiveOidc.LoggedIn<DecodedOidcIdToken>>({
                  ...common,
                  "isUserLoggedIn": true,
                  "oidcTokens": {
                      ...tokens!,
                      "decodedIdToken": decodedIdToken!
                  },
                  "logout": oidc.logout,
                  "renewTokens": oidc.renewTokens,
                  "login": undefined
              })
            : id<ReactiveOidc.NotLoggedIn>({
                  ...common,
                  "isUserLoggedIn": false,
                  "login": oidc.login,
                  "oidcTokens": undefined,
                  "logout": undefined
              });
    }

    return { useOidc };
}
