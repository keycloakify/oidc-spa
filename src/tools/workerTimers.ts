import { workerTimers } from "../vendor/frontend/worker-timers";

export type TimerHandle = {
    __timerBrand: never;
};

const clearByTimerHandle = new WeakMap<TimerHandle, () => void>();

export function setTimeout(callback: () => void, delay: number): TimerHandle {
    const callback_actual = () => {
        document.removeEventListener("visibilitychange", visibilityChangeListener);

        clearByTimerHandle.delete(timerHandle);

        callback();
    };

    let timerHandle_n = workerTimers.setTimeout(callback_actual, delay);

    const timerHandle: TimerHandle = {} as any;

    clearByTimerHandle.set(timerHandle, () => {
        clearByTimerHandle.delete(timerHandle);

        workerTimers.clearTimeout(timerHandle_n);

        document.removeEventListener("visibilitychange", visibilityChangeListener);
    });

    const start = Date.now();

    const visibilityChangeListener = () => {
        if (document.visibilityState === "visible") {
            workerTimers.clearTimeout(timerHandle_n);

            const elapsed = Date.now() - start;

            if (elapsed < delay) {
                timerHandle_n = workerTimers.setTimeout(callback_actual, delay - elapsed);
            } else {
                callback_actual();
            }
        }
    };

    document.addEventListener("visibilitychange", visibilityChangeListener);

    return timerHandle;
}

export function clearTimeout(handle: TimerHandle): void {
    const clear = clearByTimerHandle.get(handle);

    if (clear === undefined) {
        return;
    }

    clear();
}
