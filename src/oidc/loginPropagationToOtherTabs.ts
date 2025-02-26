import { assert, is } from "../vendor/frontend/tsafe";
import { Deferred } from "../tools/Deferred";

const GLOBAL_CONTEXT_KEY = "__oidc-spa.loginPropagationToOtherTabs.globalContext";

declare global {
    interface Window {
        [GLOBAL_CONTEXT_KEY]: {
            appInstanceId: string;
        };
    }
}

window[GLOBAL_CONTEXT_KEY] ??= {
    appInstanceId: Math.random().toString(36).slice(2)
};

const globalContext = window[GLOBAL_CONTEXT_KEY];

type Message = {
    appInstanceId: string;
    configId: string;
};

function getChannelName(params: { configId: string }) {
    const { configId } = params;
    return `oidc-spa:login-propagation:${configId}`;
}

export function notifyOtherTabsOfLogin(params: { configId: string }) {
    const { configId } = params;

    const message: Message = {
        configId,
        appInstanceId: globalContext.appInstanceId
    };

    new BroadcastChannel(getChannelName({ configId })).postMessage(message);
}

export function getPrOtherTabLogin(params: { configId: string }) {
    const { configId } = params;

    const dOtherTabLogin = new Deferred<void>();

    const channel = new BroadcastChannel(getChannelName({ configId }));

    channel.onmessage = ({ data: message }) => {
        assert(is<Message>(message));

        if (message.appInstanceId === globalContext.appInstanceId) {
            return;
        }

        channel.close();

        dOtherTabLogin.resolve();
    };

    const prOtherTabLogin = dOtherTabLogin.pr;

    return { prOtherTabLogin };
}
