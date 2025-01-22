import { assert, is, type Param0 } from "../vendor/frontend/tsafe";
import { Deferred } from "../tools/Deferred";
import type { Oidc } from "./Oidc";

type LogoutParams = Param0<Oidc.LoggedIn["logout"]>;

type Message = {
    logoutParams: LogoutParams;
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

export function notifyOtherTabOfLogout(params: { configHash: string; logoutParams: LogoutParams }) {
    const { configHash, logoutParams } = params;

    const message: Message = {
        logoutParams,
        appInstanceId: getAppInstanceId()
    };

    new BroadcastChannel(getChannelName({ configHash })).postMessage(message);
}

export function getPrOtherTabLogout(params: { configHash: string }) {
    const { configHash } = params;

    const dOtherTabLogout = new Deferred<LogoutParams>();

    const channel = new BroadcastChannel(getChannelName({ configHash }));

    channel.onmessage = ({ data: message }) => {
        assert(is<Message>(message));

        channel.close();

        if (message.appInstanceId === getAppInstanceId()) {
            return;
        }

        dOtherTabLogout.resolve(message.logoutParams);
    };

    return { prOtherTabLogout: dOtherTabLogout.pr };
}
