import type { Register } from "@tanstack/react-router";
// NOTE: This is actually "@tanstack/react-start/server" but since our module is not labeled as ESM we import it from here.
// it does not matter since it's type level only.
import type { RequestHandler } from "@tanstack/react-start-server";
import { getStateDataCookies } from "../../core/StateDataCookie";

export function __withOidcSpaServerEntry<T extends { fetch: RequestHandler<Register> }>(
    serverEntry_original: T
): T {
    return {
        ...serverEntry_original,
        fetch: async (request, requestOpts) => {
            render_deepLink_instead_of_home_on_authResponse: {
                const url = new URL(request.url);

                const stateUrlParamValue = url.searchParams.get("state");

                if (stateUrlParamValue === null) {
                    break render_deepLink_instead_of_home_on_authResponse;
                }

                const { stateDataCookies } = getStateDataCookies({
                    cookieHeaderParamValue: request.headers.get("cookie")
                });

                const entry = stateDataCookies.find(
                    entry => entry.stateUrlParamValue === stateUrlParamValue
                );

                if (entry === undefined) {
                    break render_deepLink_instead_of_home_on_authResponse;
                }

                const { stateDataCookie } = entry;

                const rootRelativeRedirectUrl = (() => {
                    if (
                        stateDataCookie.action === "login" &&
                        url.searchParams.get("error") === "consent_required"
                    ) {
                        return stateDataCookie.rootRelativeRedirectUrl_consentRequiredCase;
                    }
                    return stateDataCookie.rootRelativeRedirectUrl;
                })();

                url.pathname = "/";
                url.search = "";
                url.hash = "";

                const url_str_new = `${url.href.slice(0, -1)}${rootRelativeRedirectUrl}`;

                const request_new = new Request(url_str_new, request);

                return serverEntry_original.fetch(request_new, requestOpts);
            }

            return serverEntry_original.fetch(request, requestOpts);
        }
    };
}
