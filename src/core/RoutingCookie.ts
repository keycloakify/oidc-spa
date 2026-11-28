const SEPARATOR = "%_";

export type RoutingCookie = {
    rootRelativeReturnToUrl: string;
};

function serializeRoutingCookie(params: { routingCookie: RoutingCookie; time: number }): string {
    const { routingCookie, time } = params;

    return `${Math.floor(time / 1_000)}${SEPARATOR}${encodeURIComponent(
        routingCookie.rootRelativeReturnToUrl
    )}`;
}

function parseRoutingCookie(params: { routingCookie_str: string }):
    | {
          routingCookie: RoutingCookie;
          time: number;
      }
    | undefined {
    const { routingCookie_str } = params;

    const [time_seconds_str, ...rest] = routingCookie_str.split(SEPARATOR);

    const time = parseInt(time_seconds_str) * 1000;

    if (isNaN(time)) {
        return undefined;
    }

    // Older login cookies include a second return URL. Ignore it for pending callbacks.
    if (rest.length !== 1 && rest.length !== 2) {
        return undefined;
    }

    let rootRelativeReturnToUrl: string;

    try {
        rootRelativeReturnToUrl = decodeURIComponent(rest[0]);
        new URL(`http://localhost${rootRelativeReturnToUrl}`);
    } catch {
        return undefined;
    }

    return { routingCookie: { rootRelativeReturnToUrl }, time };
}

const ROUTING_COOKIE_NAME_PREFIX = "oidc_rte_";

export function setRoutingCookie(params: {
    routingCookie: RoutingCookie;
    stateUrlParamValue_instance: string;
    homeUrl: string;
}): void {
    const { routingCookie, stateUrlParamValue_instance, homeUrl } = params;

    const { routingCookies, unparsableCookieNames } = getRootingCookies({
        cookieHeaderParamValue: document.cookie
    });

    {
        const cookieNames_toDelete = [...unparsableCookieNames];

        routingCookies.forEach(({ stateUrlParamValue, time }) => {
            if (Date.now() - time > 15 * 60 * 1_000) {
                cookieNames_toDelete.push(`${ROUTING_COOKIE_NAME_PREFIX}${stateUrlParamValue}`);
            }
        });

        cookieNames_toDelete.forEach(cookieName => {
            document.cookie = `${cookieName}=; Path=${new URL(homeUrl).pathname}; Max-Age=0`;
        });
    }

    document.cookie = [
        `${ROUTING_COOKIE_NAME_PREFIX}${stateUrlParamValue_instance}=`,
        `${serializeRoutingCookie({
            routingCookie,
            time: Date.now()
        })}; `,
        "Max-Age=432000; ",
        `Path=${new URL(homeUrl).pathname}`
    ].join("");
}

export function clearRoutingCookie(params: { stateUrlParamValue: string; homeUrl: string }) {
    const { stateUrlParamValue, homeUrl } = params;

    document.cookie = `${ROUTING_COOKIE_NAME_PREFIX}${stateUrlParamValue}=; Path=${
        new URL(homeUrl).pathname
    }; Max-Age=0`;
}

export function getRootingCookies(params: { cookieHeaderParamValue: string | null }): {
    routingCookies: {
        stateUrlParamValue: string;
        routingCookie: RoutingCookie;
        time: number;
    }[];
    unparsableCookieNames: string[];
} {
    const { cookieHeaderParamValue } = params;

    if (cookieHeaderParamValue === null) {
        return {
            routingCookies: [],
            unparsableCookieNames: []
        };
    }

    const routingCookies: {
        stateUrlParamValue: string;
        routingCookie: RoutingCookie;
        time: number;
    }[] = [];

    const unparsableCookieNames: string[] = [];

    for (const part of cookieHeaderParamValue.split(";")) {
        let entry: { name: string; value: string };

        {
            let [name, ...rest] = part.split("=");

            name = name.trim();

            if (!name.startsWith(ROUTING_COOKIE_NAME_PREFIX)) {
                continue;
            }

            entry = { name, value: rest.join("=").trim() };
        }

        const { name, value } = entry;

        const result = parseRoutingCookie({
            routingCookie_str: value
        });

        if (result === undefined) {
            unparsableCookieNames.push(name);
            continue;
        }

        const { routingCookie, time } = result;

        routingCookies.push({
            stateUrlParamValue: name.slice(ROUTING_COOKIE_NAME_PREFIX.length),
            routingCookie,
            time
        });
    }

    return { routingCookies, unparsableCookieNames };
}
