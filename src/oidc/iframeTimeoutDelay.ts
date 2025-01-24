import { getDownlinkAndRtt } from "../tools/getDownlinkAndRtt";

// Base delay is the minimum delay we're willing to tolerate
const BASE_DELAY_MS = 3000;

let cache: number | undefined = undefined;

export function getIFrameTimeoutDelayMs(): number {
    if (cache !== undefined) {
        return cache;
    }

    const downlinkAndRtt = getDownlinkAndRtt();

    if (downlinkAndRtt === undefined) {
        return 5000;
    }

    const { downlink, rtt } = downlinkAndRtt;

    // Calculate dynamic delay based on RTT and downlink
    // Add 1 to downlink to avoid division by zero
    const dynamicDelay = rtt * 2.5 + 3000 / (downlink + 1);

    cache = Math.max(BASE_DELAY_MS, dynamicDelay);

    return cache;
}
