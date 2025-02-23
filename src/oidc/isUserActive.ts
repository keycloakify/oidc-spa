import { createStatefulObservable } from "../tools/StatefulObservable";
import { subscribeToUserInteraction } from "../tools/subscribeToUserInteraction";
import { assert, is, id } from "../vendor/frontend/tsafe";
import { setTimeout, clearTimeout } from "../tools/workerTimers";

const GLOBAL_CONTEXT_KEY = "__oidc-spa.createIsUserActive.globalContext";

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

export function create$isUserActive(params: { configId: string; sessionId: string | undefined }) {
    const { configId, sessionId } = params;

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

    const $isUserActive = createStatefulObservable(() => true);

    const scheduleSetInactive = () => {
        const timer = setTimeout(() => {
            assert($isUserActive.current);
            $isUserActive.current = false;
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

        if (!$isUserActive.current) {
            $isUserActive.current = true;
        }
    };

    subscribeToUserInteraction({
        throttleMs: 1_000,
        callback: () => onUserActivity({ isInteractionOnCurrentTab: true })
    });

    subscribeToUserInteractionOnOtherTabs(() => onUserActivity({ isInteractionOnCurrentTab: false }));

    return $isUserActive;
}
