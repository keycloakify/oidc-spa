import { assert, is } from "../vendor/frontend/tsafe";
import { Deferred } from "../tools/Deferred";

const globalContext = {
    appInstanceId: Math.random().toString(36).slice(2)
};

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
