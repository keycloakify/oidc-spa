import { typeGuard, id } from "../vendor/frontend/tsafe";

function getKey(params: { configId: string }) {
    const { configId } = params;

    return `oidc-spa:auth-state:${configId}`;
}

type PersistedAuthState = PersistedAuthState.LoggedIn | PersistedAuthState.ExplicitlyLoggedOut;
namespace PersistedAuthState {
    type Common = {
        __brand: "PersistedAuthState-v1";
    };

    export type LoggedIn = Common & {
        stateDescription: "logged in";
        untilTime: number | undefined;
    };

    export type ExplicitlyLoggedOut = Common & {
        stateDescription: "explicitly logged out";
    };
}

export function persistAuthState(params: {
    configId: string;
    state:
        | Omit<PersistedAuthState.ExplicitlyLoggedOut, "__brand">
        | Omit<PersistedAuthState.LoggedIn, "__brand">
        | undefined;
}) {
    const { configId, state } = params;

    const key = getKey({ configId });

    if (state === undefined) {
        localStorage.removeItem(key);
        return;
    }

    localStorage.setItem(
        key,
        JSON.stringify(
            id<PersistedAuthState>({
                __brand: "PersistedAuthState-v1",
                ...state
            })
        )
    );
}

export function getPersistedAuthState(params: {
    configId: string;
}): PersistedAuthState["stateDescription"] | undefined {
    const { configId } = params;

    const key = getKey({ configId });

    const value = localStorage.getItem(key);

    if (value === null) {
        return undefined;
    }

    let state: unknown;

    try {
        state = JSON.parse(value);
    } catch {
        localStorage.removeItem(key);
        return undefined;
    }

    if (
        !typeGuard<PersistedAuthState>(
            state,
            state instanceof Object &&
                "__brand" in state &&
                state.__brand === id<PersistedAuthState["__brand"]>("PersistedAuthState-v1")
        )
    ) {
        localStorage.removeItem(key);
        return undefined;
    }

    if (state.stateDescription === "logged in") {
        if (state.untilTime !== undefined && state.untilTime <= Date.now()) {
            localStorage.removeItem(key);
            return undefined;
        }
    }

    return state.stateDescription;
}
