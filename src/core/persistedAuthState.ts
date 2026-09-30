import { typeGuard } from "../tools/tsafe/typeGuard";
import { id } from "../tools/tsafe/id";
import { INFINITY_TIME } from "../tools/INFINITY_TIME";
import type { AsyncStorage } from "../vendor/frontend/oidc-client-ts";
import { localStorageAdapter } from "../tools/localStorageAdapter";

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

export async function persistAuthState(params: {
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
    storageAdapter?: AsyncStorage;
}) {
    const { configId, state, storageAdapter } = params;

    const adapter = storageAdapter ?? localStorageAdapter;

    const key = getKey({ configId });

    if (state === undefined) {
        await adapter.removeItem(key);
        return;
    }

    const serialized = JSON.stringify(
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

                                const untilTime = Math.min(
                                    untilTime_real ?? INFINITY_TIME,
                                    unitTime_userOverwrite ?? INFINITY_TIME
                                );

                                if (untilTime === INFINITY_TIME) {
                                    return undefined;
                                }

                                return untilTime;
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
    );

    await adapter.setItem(key, serialized);
}

export async function getPersistedAuthState(params: {
    configId: string;
    storageAdapter?: AsyncStorage;
}): Promise<PersistedAuthState["stateDescription"] | undefined> {
    const { configId, storageAdapter } = params;

    const adapter = storageAdapter ?? localStorageAdapter;

    const key = getKey({ configId });

    const value = await adapter.getItem(key);

    if (value === null) {
        return undefined;
    }

    let state: unknown;

    try {
        state = JSON.parse(value);
    } catch {
        await adapter.removeItem(key);
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
        await adapter.removeItem(key);
        return undefined;
    }

    if (state.stateDescription === "logged in") {
        if (state.untilTime !== undefined && state.untilTime <= Date.now()) {
            await adapter.removeItem(key);
            return undefined;
        }
    }

    return state.stateDescription;
}
