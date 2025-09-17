import { workerTimers } from "../vendor/frontend/worker-timers";

export type TimerHandle = {
    __timerBrand: never;
};

const clearByTimerHandle = new WeakMap<TimerHandle, () => void>();

export function setTimeout(callback: () => void, delay: number): TimerHandle {
    const callback_actual = () => {
        window.removeEventListener("pageshow", onPageshow);

        clearByTimerHandle.delete(timerHandle);

        callback();
    };

    let timerHandle_n = workerTimers.setTimeout(callback_actual, delay);

    const timerHandle: TimerHandle = {} as any;

    clearByTimerHandle.set(timerHandle, () => {
        clearByTimerHandle.delete(timerHandle);

        workerTimers.clearTimeout(timerHandle_n);

        window.removeEventListener("pageshow", onPageshow);
    });

    const start = Date.now();

    const onPageshow = (event: { persisted: boolean }) => {
        if (!event.persisted) {
            return;
        }

        workerTimers.clearTimeout(timerHandle_n);

        const elapsed = Date.now() - start;

        if (elapsed < delay) {
            timerHandle_n = workerTimers.setTimeout(callback_actual, delay - elapsed);
        } else {
            callback_actual();
        }
    };

    window.addEventListener("pageshow", onPageshow);

    return timerHandle;
}

export function clearTimeout(handle: TimerHandle): void {
    const clear = clearByTimerHandle.get(handle);

    if (clear === undefined) {
        return;
    }

    clear();
}
