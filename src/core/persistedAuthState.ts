import { typeGuard } from "../tools/tsafe/typeGuard";
import { id } from "../tools/tsafe/id";

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
        | {
              stateDescription: "logged in";
              idleSessionLifetimeInSeconds: number | undefined;
              refreshTokenExpirationTime: number | undefined;
              serverDateNow: number;
          }
        | {
              stateDescription: "explicitly logged out";
          }
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
            id<PersistedAuthState>(
                (() => {
                    switch (state.stateDescription) {
                        case "logged in":
                            return id<PersistedAuthState.LoggedIn>({
                                __brand: "PersistedAuthState-v1",
                                stateDescription: "logged in",
                                untilTime: (() => {
                                    const {
                                        idleSessionLifetimeInSeconds,
                                        refreshTokenExpirationTime,
                                        serverDateNow
                                    } = state;

                                    const untilTime_real = (() => {
                                        if (refreshTokenExpirationTime === undefined) {
                                            return undefined;
                                        }

                                        const msBeforeExpirationOfTheSession =
                                            refreshTokenExpirationTime - serverDateNow;

                                        return Date.now() + msBeforeExpirationOfTheSession;
                                    })();

                                    const unitTime_userOverwrite = (() => {
                                        if (idleSessionLifetimeInSeconds === undefined) {
                                            return undefined;
                                        }

                                        return Date.now() + idleSessionLifetimeInSeconds * 1000;
                                    })();

                                    return Math.min(
                                        untilTime_real ?? Number.POSITIVE_INFINITY,
                                        unitTime_userOverwrite ?? Number.POSITIVE_INFINITY
                                    );
                                })()
                            });
                        case "explicitly logged out":
                            return id<PersistedAuthState.ExplicitlyLoggedOut>({
                                __brand: "PersistedAuthState-v1",
                                stateDescription: "explicitly logged out"
                            });
                    }
                })()
            )
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
