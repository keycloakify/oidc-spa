import { assert, is } from "../vendor/frontend/tsafe";
import { Deferred } from "../tools/Deferred";

type Message = {
    appInstanceId: string;
    redirectUrl_initiator: string;
    configHash: string;
};

function getChannelName(params: { sessionIdOrConfigHash: string }) {
    const { sessionIdOrConfigHash } = params;
    return `oidc-spa:logout-propagation:${sessionIdOrConfigHash}`;
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
    configHash: string;
    sessionId: string | undefined;
}) {
    const { redirectUrl, configHash, sessionId } = params;

    const message: Message = {
        redirectUrl_initiator: redirectUrl,
        configHash,
        appInstanceId: getAppInstanceId()
    };

    new BroadcastChannel(getChannelName({ sessionIdOrConfigHash: sessionId ?? configHash })).postMessage(
        message
    );
}

export function getPrOtherTabLogout(params: {
    sessionId: string | undefined;
    configHash: string;
    homeUrl: string;
}) {
    const { sessionId, configHash, homeUrl } = params;

    const dOtherTabLogout = new Deferred<{ redirectUrl: string }>();

    const channel = new BroadcastChannel(
        getChannelName({ sessionIdOrConfigHash: sessionId ?? configHash })
    );

    channel.onmessage = ({ data: message }) => {
        assert(is<Message>(message));

        channel.close();

        if (message.appInstanceId === getAppInstanceId()) {
            return;
        }

        const redirectUrl = (() => {
            if (configHash === message.configHash) {
                return message.redirectUrl_initiator;
            }

            return homeUrl;
        })();

        dOtherTabLogout.resolve({ redirectUrl });
    };

    const prOtherTabLogout = dOtherTabLogout.pr;

    return { prOtherTabLogout };
}
