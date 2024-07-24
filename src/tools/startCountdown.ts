import { setTimeout, clearTimeout } from "../vendor/worker-timers";

export function createStartCountdown(params: {
    tickCallback: (params: { secondsLeft: number | undefined }) => void;
    getCountdownEndTime: () => number;
}) {
    const { getCountdownEndTime, tickCallback } = params;

    const getCountdownEndInMs = () => getCountdownEndTime() - Date.now();

    function startCountdown() {
        let timer: ReturnType<typeof setTimeout>;

        (async () => {
            let secondsLeft = Math.floor(getCountdownEndInMs() / 1000);

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
            tickCallback({ "secondsLeft": undefined });
        };

        return { stopCountdown };
    }

    return { startCountdown };
}
