import { getPrUserInteraction } from "./getPrUserInteraction";

export function subscribeToUserInteraction(params: { precisionMs: number; callback: () => void }) {
    const { precisionMs } = params;

    let timer: ReturnType<typeof setTimeout> | undefined = undefined;

    (async function callee() {
        await getPrUserInteraction();

        params.callback();

        await new Promise<void>(resolve => {
            timer = setTimeout(resolve, precisionMs);
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
