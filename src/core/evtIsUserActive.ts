import { createEvt, type NonPostableEvt } from "../tools/Evt";
import { subscribeToUserInteraction } from "../tools/subscribeToUserInteraction";
import { assert, is, id } from "../vendor/frontend/tsafe";
import { setTimeout, clearTimeout } from "../tools/workerTimers";

const globalContext = {
    appInstanceId: Math.random().toString(36).slice(2),
    evtIsUserActiveBySessionId: new Map<string, NonPostableEvt<boolean>>()
};

export function createEvtIsUserActive(params: {
    configId: string;
    sessionId: string | undefined;
}): NonPostableEvt<boolean> {
    const { configId, sessionId } = params;

    use_existing_instance: {
        if (sessionId === undefined) {
            break use_existing_instance;
        }

        const evtIsUserActive = globalContext.evtIsUserActiveBySessionId.get(sessionId);

        if (evtIsUserActive === undefined) {
            break use_existing_instance;
        }

        return evtIsUserActive;
    }

    const { notifyOtherTabsOfUserInteraction, subscribeToUserInteractionOnOtherTabs } = (() => {
        type Message = {
            appInstanceId: string;
        };

        const channelName = `oidc-spa:user-interaction-tracker:${sessionId ?? configId}`;

        function notifyOtherTabsOfUserInteraction() {
            new BroadcastChannel(channelName).postMessage(
                id<Message>({
                    appInstanceId: globalContext.appInstanceId
                })
            );
        }

        function subscribeToUserInteractionOnOtherTabs(callback: () => void) {
            const channel = new BroadcastChannel(channelName);

            channel.onmessage = ({ data: message }) => {
                assert(is<Message>(message));

                if (message.appInstanceId === globalContext.appInstanceId) {
                    return;
                }

                callback();
            };
        }

        return { notifyOtherTabsOfUserInteraction, subscribeToUserInteractionOnOtherTabs };
    })();

    const evtIsUserActive = createEvt<boolean>();
    let isUserActive = true;

    const scheduleSetInactive = () => {
        const timer = setTimeout(() => {
            assert(isUserActive, "011507");
            isUserActive = false;
            evtIsUserActive.post(isUserActive);
        }, 5_000);
        return () => {
            clearTimeout(timer);
            clearScheduledSetInactive = undefined;
        };
    };

    let clearScheduledSetInactive: (() => void) | undefined = scheduleSetInactive();

    const onUserActivity = (params: { isInteractionOnCurrentTab: boolean }) => {
        const { isInteractionOnCurrentTab } = params;

        clearScheduledSetInactive?.();
        clearScheduledSetInactive = scheduleSetInactive();

        if (isInteractionOnCurrentTab) {
            notifyOtherTabsOfUserInteraction();
        }

        if (!isUserActive) {
            isUserActive = true;
            evtIsUserActive.post(isUserActive);
        }
    };

    subscribeToUserInteraction({
        throttleMs: 1_000,
        callback: () => onUserActivity({ isInteractionOnCurrentTab: true })
    });

    subscribeToUserInteractionOnOtherTabs(() => onUserActivity({ isInteractionOnCurrentTab: false }));

    if (sessionId !== undefined) {
        globalContext.evtIsUserActiveBySessionId.set(sessionId, evtIsUserActive);
    }

    return evtIsUserActive;
}
