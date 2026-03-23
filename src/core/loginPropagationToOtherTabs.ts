import { assert, is } from "../tools/tsafe/assert";
import { Deferred } from "../tools/Deferred";

declare global {
    interface Window {
        "__oidc-spa.createOidc.loginPropagationToOtherTabs": {
            appInstanceId: string;
        };
    }
}

window["__oidc-spa.createOidc.loginPropagationToOtherTabs"] ??= {
    appInstanceId: Math.random().toString(36).slice(2)
};

const globalContext = window["__oidc-spa.createOidc.loginPropagationToOtherTabs"];

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
