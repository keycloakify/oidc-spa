import type { Plugin } from "vite";
import { MagicString } from "../vendor/build-runtime/magic-string";

type OidcSpaVitePluginParams = {};

export function oidcSpa(params?: OidcSpaVitePluginParams) {
    const {} = params ?? {};

    const plugin = {
        name: "oidc-spa",
        configResolved: async resolvedConfig => {
            console.log(MagicString, resolvedConfig);
        },
        transform: (code, id) => {
            console.log({ code, id });
        },
        closeBundle: async () => {},
        transformIndexHtml: html => {
            console.log(html);
        }
    } satisfies Plugin;

    return plugin as any;
}
