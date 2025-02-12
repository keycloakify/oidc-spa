import { assert, is } from "../vendor/frontend/tsafe";
import { Deferred } from "../tools/Deferred";

type Message = {
    appInstanceId: string;
    redirectUrl_initiator: string;
    configId: string;
};

function getChannelName(params: { sessionIdOrConfigId: string }) {
    const { sessionIdOrConfigId } = params;
    return `oidc-spa:logout-propagation:${sessionIdOrConfigId}`;
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

export function notifyOtherTabOfLogout(params: {
    redirectUrl: string;
    configId: string;
    sessionId: string | undefined;
}) {
    const { redirectUrl, configId, sessionId } = params;

    const message: Message = {
        redirectUrl_initiator: redirectUrl,
        configId,
        appInstanceId: getAppInstanceId()
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

        channel.close();

        if (message.appInstanceId === getAppInstanceId()) {
            return;
        }

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
