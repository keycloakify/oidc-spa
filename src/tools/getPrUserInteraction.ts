import { Deferred } from "./Deferred";

export function getPrUserInteraction() {
    const d = new Deferred<void>();

    const callback = () => {
        d.resolve();
        cleanup();
    };

    const cleanup = () => {
        window.document.removeEventListener("mousemove", callback, false);
        window.document.removeEventListener("keydown", callback, false);
        window.document.removeEventListener("touchstart", callback, false);
        window.document.removeEventListener("touchend", callback, false);
    };

    window.document.addEventListener("mousemove", callback, false);
    window.document.addEventListener("keydown", callback, false);
    window.document.addEventListener("touchstart", callback, false);
    window.document.addEventListener("touchend", callback, false);

    return {
        prUserInteraction: d.pr,
        cancelPrUserInteraction: cleanup
    };
}
