import { assert, is } from "../vendor/frontend/tsafe";
import { Deferred } from "../tools/Deferred";

type Message = {
    postLogoutRedirectUrl: string;
    appInstanceId: string;
};

function getChannelName(params: { configHash: string }) {
    const { configHash } = params;
    return `oidc-spa:logout-propagation:${configHash}`;
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

export function notifyOtherTabOfLogout(params: { configHash: string; postLogoutRedirectUrl: string }) {
    const { configHash, postLogoutRedirectUrl } = params;

    const message: Message = {
        postLogoutRedirectUrl,
        appInstanceId: getAppInstanceId()
    };

    new BroadcastChannel(getChannelName({ configHash })).postMessage(message);
}

export function getPrOtherTabLogout(params: { configHash: string }) {
    const { configHash } = params;

    const dOtherTabLogout = new Deferred<{ postLogoutRedirectUrl: string }>();

    const channel = new BroadcastChannel(getChannelName({ configHash }));

    channel.onmessage = ({ data: message }) => {
        assert(is<Message>(message));

        channel.close();

        if (message.appInstanceId === getAppInstanceId()) {
            return;
        }

        const { postLogoutRedirectUrl } = message;

        dOtherTabLogout.resolve({ postLogoutRedirectUrl });
    };

    const prOtherTabLogout = dOtherTabLogout.pr;

    return { prOtherTabLogout };
}
