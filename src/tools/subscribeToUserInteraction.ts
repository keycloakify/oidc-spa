import { getPrUserInteraction } from "./getPrUserInteraction";
import { clearTimeout, setTimeout } from "worker-timers";

export function subscribeToUserInteraction(params: { throttleMs: number; callback: () => void }) {
    const { throttleMs } = params;

    const cleanups = new Set<() => void>();

    (async function callee() {
        const { cancelPrUserInteraction, prUserInteraction } = getPrUserInteraction();

        cleanups.add(cancelPrUserInteraction);

        await prUserInteraction;

        params.callback();

        await new Promise<void>(resolve => {
            const timer = setTimeout(resolve, throttleMs);
            cleanups.add(() => {
                clearTimeout(timer);
            });
        });

        cleanups.clear();
        callee();
    })();

    const unsubscribeFromUserInteraction = () => {
        Array.from(cleanups).forEach(cleanup => cleanup());
    };

    return { unsubscribeFromUserInteraction };
}
