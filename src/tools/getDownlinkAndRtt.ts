import { assert } from "../vendor/frontend/tsafe";

export function getDownlinkAndRtt(): { downlink: number; rtt: number } | undefined {
    if (!(window.navigator instanceof Object)) {
        return undefined;
    }

    const navigator: any = window.navigator;

    for (const key of ["connection", "mozConnection", "webkitConnection"] as const) {
        try {
            const { downlink, rtt } = navigator[key];

            assert(typeof downlink === "number", "768860");
            assert(typeof rtt === "number", "945829");

            return { downlink, rtt };
        } catch {}
    }

    return undefined;
}
