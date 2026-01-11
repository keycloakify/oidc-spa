import { getIsLikelyDevServer } from "../tools/isLikelyDevServer";

export function getIsHostnameAuthorized(params: { allowedHostnames: string[]; hostname: string }) {
    if (getIsLikelyDevServer()) {
        return true;
    }

    const { hostname, allowedHostnames } = params;

    if (hostname === location.host) {
        return true;
    }

    for (let allowedHost of allowedHostnames) {
        allowedHost = allowedHost.toLowerCase();

        if (allowedHost === hostname) {
            return true;
        }

        if (allowedHost.startsWith("*") && hostname.endsWith(allowedHost.slice(1))) {
            return true;
        }
    }

    return false;
}
