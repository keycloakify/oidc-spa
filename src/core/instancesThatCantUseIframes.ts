import { createStatefulEvt } from "../tools/StatefulEvt";

const SESSION_STORAGE_KEY = "oidc-spa:more-than-one-instance-cant-use-iframe";

export const evtIsThereMoreThanOneInstanceThatCantUserIframes = createStatefulEvt(
    () => sessionStorage.getItem(SESSION_STORAGE_KEY) !== null
);

let count = 0;

export function notifyNewInstanceThatCantUseIframes() {
    count++;

    if (count === 1) {
        return;
    }

    if (evtIsThereMoreThanOneInstanceThatCantUserIframes.current) {
        return;
    }

    sessionStorage.setItem(SESSION_STORAGE_KEY, "true");
    evtIsThereMoreThanOneInstanceThatCantUserIframes.current = true;
}
