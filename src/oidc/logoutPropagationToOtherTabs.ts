import { assert, is } from "../vendor/frontend/tsafe";
import { Deferred } from "../tools/Deferred";

const GLOBAL_CONTEXT_KEY = "__oidc-spa.logoutPropagationToOtherTabs.globalContext";

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
    redirectUrl_initiator: string;
    configId: string;
};

function getChannelName(params: { sessionIdOrConfigId: string }) {
    const { sessionIdOrConfigId } = params;
    return `oidc-spa:logout-propagation:${sessionIdOrConfigId}`;
}

export function notifyOtherTabsOfLogout(params: {
    redirectUrl: string;
    configId: string;
    sessionId: string | undefined;
}) {
    const { redirectUrl, configId, sessionId } = params;

    const message: Message = {
        redirectUrl_initiator: redirectUrl,
        configId,
        appInstanceId: globalContext.appInstanceId
    };

    new BroadcastChannel(getChannelName({ sessionIdOrConfigId: sessionId ?? configId })).postMessage(
        message
    );
}

export function getPrOtherTabLogout(params: {
    sessionId: string | undefined;
    configId: string;
    homeUrl: string;
}) {
    const { sessionId, configId, homeUrl } = params;

    const dOtherTabLogout = new Deferred<{ redirectUrl: string }>();

    const channel = new BroadcastChannel(getChannelName({ sessionIdOrConfigId: sessionId ?? configId }));

    channel.onmessage = ({ data: message }) => {
        assert(is<Message>(message));

        if (message.appInstanceId === globalContext.appInstanceId) {
            return;
        }

        channel.close();

        const redirectUrl = (() => {
            if (configId === message.configId) {
                return message.redirectUrl_initiator;
            }

            return homeUrl;
        })();

        dOtherTabLogout.resolve({ redirectUrl });
    };

    const prOtherTabLogout = dOtherTabLogout.pr;

    return { prOtherTabLogout };
}
