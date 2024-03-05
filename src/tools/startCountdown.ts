export function createStartCountdown(params: {
    startTickAtSecondsLeft: number;
    tickCallback: (params: { secondsLeft: number }) => void;
    /**
     * Called when used moves when there was less than startTickAtSecondsLeft
     * seconds left before automatic logout.
     */
    onReset: (() => void) | undefined;
    msLeftWhenStartingCountdown: number;
}) {
    const { msLeftWhenStartingCountdown, onReset, startTickAtSecondsLeft, tickCallback } = params;

    function startCountdown() {
        let timer: ReturnType<typeof setTimeout>;

        let wasTickCallbackCalled = false;

        (async () => {
            await new Promise<void>(resolve => {
                const timerMs = msLeftWhenStartingCountdown - startTickAtSecondsLeft * 1000;

                if (timerMs <= 0) {
                    resolve();
                    return;
                }

                timer = setTimeout(resolve, timerMs);
            });

            let secondsLeft = Math.floor(
                Math.min(msLeftWhenStartingCountdown / 1000, startTickAtSecondsLeft)
            );

            while (secondsLeft >= 0) {
                tickCallback({ secondsLeft });
                wasTickCallbackCalled = true;

                await new Promise<void>(resolve => {
                    timer = setTimeout(resolve, 1000);
                });

                secondsLeft--;
            }
        })();

        const stopCountdown = () => {
            clearTimeout(timer);
            if (wasTickCallbackCalled) {
                onReset?.();
            }
        };

        return { stopCountdown };
    }

    return { startCountdown };
}
