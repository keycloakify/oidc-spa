import { createStatefulObservable } from "./StatefulObservable";
import { subscribeToUserInteraction } from "./subscribeToUserInteraction";
import { assert } from "../vendor/tsafe";
import { setTimeout, clearTimeout } from "../vendor/worker-timers";

export function createIsUserActive(params: { theUserIsConsideredInactiveAfterMsOfInactivity: number }) {
    const { theUserIsConsideredInactiveAfterMsOfInactivity } = params;

    // this should set itself to false whenever the user had performed no user interaction for a certain amount of time
    const $isUserActive = createStatefulObservable(() => true);

    const scheduleSetInactive = () => {
        const timer = setTimeout(() => {
            assert($isUserActive.current);
            $isUserActive.current = false;
        }, theUserIsConsideredInactiveAfterMsOfInactivity);
        return () => {
            clearTimeout(timer);
        };
    };

    let clearScheduledSetInactive = scheduleSetInactive();

    const { unsubscribeFromUserInteraction } = subscribeToUserInteraction({
        "throttleMs": 1_000,
        "callback": () => {
            clearScheduledSetInactive();
            clearScheduledSetInactive = scheduleSetInactive();

            if (!$isUserActive.current) {
                $isUserActive.current = true;
            }
        }
    });

    const disable$isUserActive = () => {
        unsubscribeFromUserInteraction();
        clearScheduledSetInactive();
    };

    return { $isUserActive, disable$isUserActive };
}
