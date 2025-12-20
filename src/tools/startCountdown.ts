export function createStartCountdown(params: {
    tickCallback: (params: { secondsLeft: number | undefined }) => void;
}) {
    const { tickCallback } = params;

    function startCountdown(params: { countDownFromSeconds: number }) {
        const { countDownFromSeconds } = params;

        let timer: ReturnType<typeof setTimeout> | undefined = undefined;

        (async () => {
            let secondsLeft = Math.max(0, Math.floor(countDownFromSeconds));

            if (secondsLeft === 0) {
                tickCallback({ secondsLeft: 0 });
                return;
            }

            while (true) {
                const start = performance.now();

                await new Promise<void>(resolve => {
                    timer = setTimeout(resolve, 1_000);
                });

                const elapsed = Math.floor((performance.now() - start) / 1000);

                secondsLeft = secondsLeft - elapsed;

                if (secondsLeft < 0) {
                    secondsLeft = 0;
                }

                tickCallback({ secondsLeft });

                if (secondsLeft === 0) {
                    break;
                }
            }
        })();

        const stopCountdown = () => {
            if (timer !== undefined) {
                clearTimeout(timer);
            }
            tickCallback({ secondsLeft: undefined });
        };

        return { stopCountdown };
    }

    return { startCountdown };
}
