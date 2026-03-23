import { assert, is } from "../tools/tsafe/assert";
import { Deferred } from "../tools/Deferred";

declare global {
    interface Window {
        "__oidc-spa:globalContext:logoutPropagationToOtherTabs": {
            appInstanceId: string;
        };
    }
}

window["__oidc-spa:globalContext:logoutPropagationToOtherTabs"] ??= {
    appInstanceId: Math.random().toString(36).slice(2)
};

const globalContext = window["__oidc-spa:globalContext:logoutPropagationToOtherTabs"];

type Message = {
    appInstanceId: string;
    configId: string;
};

function getChannelName(params: { sessionIdOrConfigId: string }) {
    const { sessionIdOrConfigId } = params;
    return `oidc-spa:logout-propagation:${sessionIdOrConfigId}`;
}

export function notifyOtherTabsOfLogout(params: { configId: string; sessionId: string | undefined }) {
    const { configId, sessionId } = params;

    const message: Message = {
        configId,
        appInstanceId: globalContext.appInstanceId
    };

    new BroadcastChannel(getChannelName({ sessionIdOrConfigId: sessionId ?? configId })).postMessage(
        message
    );
}

export function getPrOtherTabLogout(params: { sessionId: string | undefined; configId: string }) {
    const { sessionId, configId } = params;

    const dOtherTabLogout = new Deferred<void>();

    const channel = new BroadcastChannel(getChannelName({ sessionIdOrConfigId: sessionId ?? configId }));

    channel.onmessage = ({ data: message }) => {
        assert(is<Message>(message));

        if (message.appInstanceId === globalContext.appInstanceId) {
            return;
        }

        channel.close();

        dOtherTabLogout.resolve();
    };

    const prOtherTabLogout = dOtherTabLogout.pr;

    return { prOtherTabLogout };
}
