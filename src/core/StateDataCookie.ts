import { assert, type Equals } from "../tools/tsafe/assert";
import { id } from "../tools/tsafe/id";

export type StateDataCookie = StateDataCookie.Login | StateDataCookie.Logout;

export namespace StateDataCookie {
    type Common = {
        rootRelativeRedirectUrl: string;
    };

    export type Login = Common & {
        action: "login";
        rootRelativeRedirectUrl_consentRequiredCase: string;
    };

    export type Logout = Common & {
        action: "logout";
    };
}

const SEPARATOR = "%_";

function serializeStateDataCookie(params: { stateDataCookie: StateDataCookie; time: number }): string {
    const { stateDataCookie, time } = params;

    let cookieValue = `${Math.floor(time / 1_000)}`;
    cookieValue += `${SEPARATOR}${encodeURIComponent(stateDataCookie.rootRelativeRedirectUrl)}`;

    switch (stateDataCookie.action) {
        case "login":
            cookieValue += `${SEPARATOR}${encodeURIComponent(
                stateDataCookie.rootRelativeRedirectUrl_consentRequiredCase
            )}`;
            break;
        case "logout":
            break;
        default:
            assert<Equals<typeof stateDataCookie, never>>(false, "30449274");
    }

    return cookieValue;
}

function parseStateDataCookie(params: { stateDataCookie_str: string }):
    | {
          stateDataCookie: StateDataCookie;
          time: number;
      }
    | undefined {
    const { stateDataCookie_str } = params;

    const [time_seconds_str, ...rest] = stateDataCookie_str.split(SEPARATOR);

    const time = parseInt(time_seconds_str) * 1000;

    if (isNaN(time)) {
        return undefined;
    }

    if (rest.length !== 1 && rest.length !== 2) {
        return undefined;
    }

    const rootRelativeRedirectUrl = decodeURIComponent(rest[0]);

    const rootRelativeRedirectUrl_consentRequiredCase =
        rest.length === 1 ? undefined : decodeURIComponent(rest[1]);

    for (const rootRelativeUrl of [
        rootRelativeRedirectUrl,
        rootRelativeRedirectUrl_consentRequiredCase
    ]) {
        if (rootRelativeRedirectUrl === undefined) {
            continue;
        }
        try {
            new URL(`http://localhost${rootRelativeUrl}`);
        } catch {
            return undefined;
        }
    }

    const stateDataCookie =
        rootRelativeRedirectUrl_consentRequiredCase === undefined
            ? id<StateDataCookie.Logout>({
                  action: "logout",
                  rootRelativeRedirectUrl
              })
            : id<StateDataCookie.Login>({
                  action: "login",
                  rootRelativeRedirectUrl,
                  rootRelativeRedirectUrl_consentRequiredCase
              });

    return { stateDataCookie, time };
}

let isEnabled = false;

export function enableStateDataCookie() {
    isEnabled = true;
}

export function getIsStateDataCookieEnabled() {
    return isEnabled;
}

const COOKIE_NAME_PREFIX = "oidc_";

export function setStateDataCookieIfEnabled(params: {
    stateDataCookie: StateDataCookie;
    stateUrlParamValue_instance: string;
    homeUrl: string;
}): void {
    const { stateDataCookie, stateUrlParamValue_instance, homeUrl } = params;

    const { stateDataCookies, unparsableCookieNames } = getStateDataCookies({
        cookieHeaderParamValue: document.cookie
    });

    {
        const cookieNames_toDelete = [...unparsableCookieNames];

        stateDataCookies.forEach(({ stateUrlParamValue, time }) => {
            if (Date.now() - time > 15 * 60 * 1_000) {
                cookieNames_toDelete.push(`${COOKIE_NAME_PREFIX}${stateUrlParamValue}`);
            }
        });

        cookieNames_toDelete.forEach(cookieName => {
            document.cookie = `${cookieName}=; Path=/; Max-Age=0`;
        });
    }

    if (!isEnabled) {
        return;
    }

    document.cookie = [
        `${COOKIE_NAME_PREFIX}${stateUrlParamValue_instance}=`,
        `${serializeStateDataCookie({
            stateDataCookie,
            time: Date.now()
        })}; `,
        "Max-Age=432000; ",
        `Path=${new URL(homeUrl).pathname}`
    ].join("");
}

export function clearStateDataCookie(params: { stateUrlParamValue: string }) {
    const { stateUrlParamValue } = params;

    document.cookie = `${COOKIE_NAME_PREFIX}${stateUrlParamValue}=; Path=/; Max-Age=0`;
}

export function getStateDataCookies(params: { cookieHeaderParamValue: string | null }): {
    stateDataCookies: {
        stateUrlParamValue: string;
        stateDataCookie: StateDataCookie;
        time: number;
    }[];
    unparsableCookieNames: string[];
} {
    const { cookieHeaderParamValue } = params;

    if (cookieHeaderParamValue === null) {
        return {
            stateDataCookies: [],
            unparsableCookieNames: []
        };
    }

    const stateDataCookies: {
        stateUrlParamValue: string;
        stateDataCookie: StateDataCookie;
        time: number;
    }[] = [];

    const unparsableCookieNames: string[] = [];

    for (const part of cookieHeaderParamValue.split(";")) {
        let entry: { name: string; value: string };

        {
            let [name, ...rest] = part.split("=");

            name = name.trim();

            if (!name.startsWith(COOKIE_NAME_PREFIX)) {
                continue;
            }

            entry = { name, value: rest.join("=").trim() };
        }

        const { name, value } = entry;

        const result = parseStateDataCookie({
            stateDataCookie_str: value
        });

        if (result === undefined) {
            unparsableCookieNames.push(name);
            continue;
        }

        const { stateDataCookie, time } = result;

        stateDataCookies.push({
            stateUrlParamValue: name.slice(COOKIE_NAME_PREFIX.length),
            stateDataCookie,
            time
        });
    }

    return { stateDataCookies, unparsableCookieNames };
}
