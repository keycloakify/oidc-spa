import { getPrUserInteraction } from "./getPrUserInteraction";

export function subscribeToUserInteraction(params: { timeResolution: number; callback: () => void }) {
    const { timeResolution } = params;

    let timer: ReturnType<typeof setTimeout> | undefined = undefined;

    (async function callee() {
        await getPrUserInteraction();

        params.callback();

        await new Promise<void>(resolve => {
            timer = setTimeout(resolve, timeResolution);
        });

        callee();
    })();

    const unsubscribeFromUserInteraction = () => {
        if (timer !== undefined) {
            clearTimeout(timer);
        }
    };

    return { unsubscribeFromUserInteraction };
}
