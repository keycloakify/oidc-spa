import { setTimeout, clearTimeout } from "../tools/workerTimers";

export function createStartCountdown(params: {
    tickCallback: (params: { secondsLeft: number | undefined }) => void;
}) {
    const { tickCallback } = params;

    function startCountdown(params: { startCountdownAtSeconds: number }) {
        const { startCountdownAtSeconds } = params;

        let timer: ReturnType<typeof setTimeout>;

        (async () => {
            let secondsLeft = Math.floor(startCountdownAtSeconds);

            while (secondsLeft >= 0) {
                tickCallback({ secondsLeft });

                await new Promise<void>(resolve => {
                    timer = setTimeout(resolve, 1_000);
                });

                secondsLeft--;
            }
        })();

        const stopCountdown = () => {
            clearTimeout(timer);
            tickCallback({ secondsLeft: undefined });
        };

        return { stopCountdown };
    }

    return { startCountdown };
}
