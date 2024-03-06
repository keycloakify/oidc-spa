import { createStatefulObservable } from "./StatefulObservable";
import { subscribeToUserInteraction } from "./subscribeToUserInteraction";

export function create$isUserActive(params: { timeWindowMs: number }) {
    const { timeWindowMs } = params;

    // this should set itself to false whenever the user had performed no user interaction for a certain amount of time
    const $isUserActive = createStatefulObservable(() => true);

    const scheduleSetInactive = () => {
        const timer = setTimeout(() => {
            $isUserActive.current = false;
        }, timeWindowMs);
        return () => {
            clearTimeout(timer);
        };
    };

    let clearScheduledSetInactive = scheduleSetInactive();

    const { unsubscribeFromUserInteraction } = subscribeToUserInteraction({
        "timeResolution": 1_000,
        "callback": () => {
            clearScheduledSetInactive();
            clearScheduledSetInactive = scheduleSetInactive();
            $isUserActive.current = true;
        }
    });

    const disable$isUserActive = () => {
        unsubscribeFromUserInteraction();
        clearScheduledSetInactive();
    };

    return { $isUserActive, disable$isUserActive };
}
