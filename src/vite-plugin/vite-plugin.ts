import type { Plugin } from "vite";
import { detectProjectType, type ProjectType } from "./detectProjectType";

//import { MagicString } from "../vendor/build-runtime/magic-string";

type OidcSpaVitePluginParams = {
    freezeFetch: boolean;
    freezeXMLHttpRequest: boolean;
    freezeWebSocket: boolean;
};

export function oidcSpa(_params: OidcSpaVitePluginParams) {
    let projectType: ProjectType | undefined = undefined;

    const plugin: Plugin = {
        name: "oidc-spa",
        configResolved(config) {
            projectType = detectProjectType(config);
        }
    };

    return plugin;
}
