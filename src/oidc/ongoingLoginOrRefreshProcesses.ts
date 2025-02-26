import { Deferred } from "../tools/Deferred";
import { assert } from "../vendor/frontend/tsafe";

const GLOBAL_CONTEXT_KEY = "__oidc-spa.ongoingLoginOrRefreshProcesses.globalContext";

declare global {
    interface Window {
        [GLOBAL_CONTEXT_KEY]: {
            prDone_arr: Promise<void>[];
            prUnlock: Promise<void>;
        };
    }
}

window[GLOBAL_CONTEXT_KEY] ??= {
    prDone_arr: [],
    prUnlock: Promise.resolve()
};

const globalContext = window[GLOBAL_CONTEXT_KEY];

export async function startLoginOrRefreshProcess(): Promise<{
    completeLoginOrRefreshProcess: () => void;
}> {
    await globalContext.prUnlock;

    const dDone = new Deferred<void>();

    const { prDone_arr } = globalContext;

    prDone_arr.push(dDone.pr);

    function completeLoginOrRefreshProcess() {
        const index = prDone_arr.indexOf(dDone.pr);

        assert(index !== -1);

        prDone_arr.splice(index, 1);

        dDone.resolve();
    }

    return { completeLoginOrRefreshProcess };
}

export async function waitForAllOtherOngoingLoginOrRefreshProcessesToComplete(params: {
    prUnlock: Promise<void>;
}): Promise<void> {
    const { prUnlock } = params;

    const prUnlock_current = globalContext.prUnlock;

    globalContext.prUnlock = (async () => {
        await prUnlock_current;

        await prUnlock;
    })();

    await Promise.all(globalContext.prDone_arr);
}
