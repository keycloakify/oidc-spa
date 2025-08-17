import { setTimeout, clearTimeout } from "../tools/workerTimers";

export function createStartCountdown(params: {
    tickCallback: (params: { secondsLeft: number | undefined }) => void;
    getCountdownEndTime: () => number;
}) {
    const { getCountdownEndTime, tickCallback } = params;

    const getCountdownEndInMs = () => Math.max(getCountdownEndTime() - Date.now(), 0);

    function startCountdown() {
        let timer: ReturnType<typeof setTimeout>;

        (async () => {
            let secondsLeft = Math.floor(getCountdownEndInMs() / 1000);

            do {
                tickCallback({ secondsLeft });

                await new Promise<void>(resolve => {
                    timer = setTimeout(resolve, 1_000);
                });

                secondsLeft--;
            } while (secondsLeft >= 0);
        })();

        const stopCountdown = () => {
            clearTimeout(timer);
            tickCallback({ secondsLeft: undefined });
        };

        return { stopCountdown };
    }

    return { startCountdown };
}
