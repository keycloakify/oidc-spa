import { Deferred } from "./Deferred";

export function getPrUserInteraction(): Promise<void> {
    const d = new Deferred<void>();

    const callback = () => {
        d.resolve();
        window.document.removeEventListener("mousemove", callback, false);
        window.document.removeEventListener("keydown", callback, false);
    };

    window.document.addEventListener("mousemove", callback, false);
    window.document.addEventListener("keydown", callback, false);

    return d.pr;
}
