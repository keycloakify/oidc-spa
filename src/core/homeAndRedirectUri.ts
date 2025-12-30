import { toFullyQualifiedUrl } from "../tools/toFullyQualifiedUrl";
import { getBASE_URL_earlyInit } from "./earlyInit_BASE_URL";

export function getHomeAndRedirectUri(params: { BASE_URL_params: string | undefined }) {
    const { BASE_URL_params } = params;

    const homeUrlAndRedirectUri = toFullyQualifiedUrl({
        urlish: (() => {
            if (BASE_URL_params !== undefined) {
                return BASE_URL_params;
            }

            const BASE_URL = getBASE_URL_earlyInit();

            if (BASE_URL === undefined) {
                throw new Error(
                    [
                        "oidc-spa: If you do not use the oidc-spa Vite plugin",
                        "you must provide the BASE_URL to the earlyInit() examples:",
                        "oidcSpaEarlyInit({ BASE_URL: import.meta.env.BASE_URL })",
                        "oidcSpaEarlyInit({ BASE_URL: '/' })",
                        "",
                        "You can also pass this parameter to createOidc({ BASE_URL: '...' })",
                        "or bootstrapOidc({ BASE_URL: '...' })"
                    ].join("\n")
                );
            }

            return BASE_URL;
        })(),
        doAssertNoQueryParams: true,
        doOutputWithTrailingSlash: true
    });

    return { homeUrlAndRedirectUri };
}
