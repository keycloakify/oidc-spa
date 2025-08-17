import { Deferred } from "../tools/Deferred";

export function getIsOnline():
    | { isOnline: true; prOnline?: never }
    | { isOnline: false; prOnline: Promise<void> } {
    if (navigator.onLine) {
        return { isOnline: true };
    }

    const dOnline = new Deferred<void>();

    const onOnline = () => {
        window.removeEventListener("online", onOnline);
        dOnline.resolve();
    };

    window.addEventListener("online", onOnline);

    return { isOnline: false, prOnline: dOnline.pr };
}
