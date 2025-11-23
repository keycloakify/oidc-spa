import { getIsLikelyDevServer } from "../tools/isLikelyDevServer";
import { getIsDomain } from "../tools/isDomain";

const MULTI_TENANT_DOMAINS = [
    "vercel.app",
    "netlify.app",
    "github.io",
    "pages.dev",
    "web.app",
    "firebaseapp.com",
    "onrender.com",
    "railway.app",
    "fly.dev",
    "herokuapp.com",
    "amplifyapp.com",
    "surge.sh",
    "stackblitz.io",
    "glitch.me",
    "csb.app",
    "codesandbox.io",
    "repl.co",
    "replit.dev",
    "ondigitalocean.app",
    "bubbleapps.io",
    "wixsite.com",
    "webflow.io",
    "framer.app",
    "deno.dev",
    "azurestaticapps.net",
    "run.app",
    "cloudfront.net",
    "qovery.io",
    "northflank.app",
    "cyclic.app",
    "turso.io",
    "koyeb.app",
    "on.fleek.co",
    "back4app.io"
];

export function getIsHostnameAuthorized(params: {
    allowedHostnames: string[];
    hostname: string;
    extendAuthorizationToParentDomain: boolean;
}) {
    if (getIsLikelyDevServer()) {
        return true;
    }

    const { hostname, allowedHostnames, extendAuthorizationToParentDomain } = params;

    if (hostname === location.host) {
        return true;
    }

    for (let allowedHost of allowedHostnames) {
        allowedHost = allowedHost.toLocaleLowerCase();

        if (allowedHost === hostname) {
            return true;
        }

        if (allowedHost.startsWith("*") && hostname.endsWith(allowedHost.slice(1))) {
            return true;
        }
    }

    if (!extendAuthorizationToParentDomain) {
        return false;
    }

    if (!getIsDomain(location.host) || !getIsDomain(hostname)) {
        return false;
    }

    if (MULTI_TENANT_DOMAINS.find(suffix => location.host.endsWith(`.${suffix}`)) !== undefined) {
        return false;
    }

    const trustedParentDomain = (() => {
        const [s1, s2] = location.host.split(".").reverse();

        return `${s2}.${s1}`;
    })();

    if (hostname.endsWith(`.${trustedParentDomain}`)) {
        return true;
    }

    return false;
}
