import type { Param0 } from "./vendor/frontend/tsafe";
import { assert } from "./vendor/frontend/tsafe";
import { Deferred } from "./tools/Deferred";
import { setTimeout } from "./vendor/frontend/worker-timers";
import type { Oidc } from "./oidc";

const KEY_PREFIX = `oidc-spa:logout-propagation:`;

function getKey(params: { configHash: string }) {
    const { configHash } = params;
    return `${KEY_PREFIX}${configHash}`;
}

type LogoutParams = Param0<Oidc.LoggedIn["logout"]>;

type ParsedValue = {
    logoutParams: LogoutParams;
    expirationTime: number;
    appInstanceId: string;
};

function isParsedValue(value: unknown): value is ParsedValue {
    return (
        value instanceof Object &&
        "logoutParams" in value &&
        value.logoutParams instanceof Object &&
        "expirationTime" in value &&
        typeof value.expirationTime === "number" &&
        "appInstanceId" in value &&
        typeof value.appInstanceId === "string"
    );
}

const getAppInstanceId = (() => {
    let appInstanceId: string | undefined;

    return () => {
        if (appInstanceId === undefined) {
            appInstanceId = Math.random().toString(36).slice(2);
        }

        return appInstanceId;
    };
})();

function getParsedValue(key: string): ParsedValue | undefined {
    const value = localStorage.getItem(key);

    if (value === null) {
        return undefined;
    }

    let parsedLocalStorageValue: unknown;

    try {
        parsedLocalStorageValue = JSON.parse(value);
        assert(isParsedValue(parsedLocalStorageValue));
    } catch {
        localStorage.removeItem(key);
        return undefined;
    }

    return parsedLocalStorageValue;
}

export function setLogoutParamsForOtherTabs(params: { configHash: string; logoutParams: LogoutParams }) {
    const { configHash, logoutParams } = params;

    const parsedValue: ParsedValue = {
        logoutParams,
        expirationTime: Date.now() + 7_000,
        appInstanceId: getAppInstanceId()
    };
    localStorage.setItem(getKey({ configHash }), JSON.stringify(parsedValue));
}

export function getPrOtherTabLogout(params: { configHash: string }) {
    const { configHash } = params;

    const dOtherTabLogout = new Deferred<LogoutParams>();

    const key = getKey({ configHash });

    localStorage.removeItem(key);

    const listener = (event: StorageEvent) => {
        if (event.key !== key) {
            return;
        }

        const parsedValue = getParsedValue(key);

        if (parsedValue === undefined) {
            return;
        }

        window.removeEventListener("storage", listener);

        if (parsedValue.appInstanceId === getAppInstanceId()) {
            return;
        }

        dOtherTabLogout.resolve(parsedValue.logoutParams);
    };

    window.addEventListener("storage", listener);

    return { prOtherTabLogout: dOtherTabLogout.pr };
}

export function garbageCollectLogoutPropagationLocalStorage() {
    const garbageCollect_specificKey = async (key: string) => {
        const parsedValue = getParsedValue(key);

        if (parsedValue === undefined) {
            return;
        }

        const msBeforeExpiration = parsedValue.expirationTime - Date.now();

        if (msBeforeExpiration > 0) {
            await new Promise(resolve => setTimeout(resolve, msBeforeExpiration));

            await garbageCollect_specificKey(key);

            return;
        }

        localStorage.removeItem(key);
    };

    const { keys } = (() => {
        const keys: string[] = [];

        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);

            if (key === null) {
                continue;
            }

            if (key.startsWith(KEY_PREFIX)) {
                keys.push(key);
            }
        }

        return { keys };
    })();

    keys.forEach(key => garbageCollect_specificKey(key));
}
