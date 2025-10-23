import type { Plugin } from "vite";
import { assert } from "../tools/tsafe/assert";
import type { Param0 } from "../tools/tsafe/Param0";
import type { oidcEarlyInit } from "../entrypoint";
import { createLoadHandleEntrypoint } from "./handleClientEntrypoint";
import { excludeModuleExportFromOptimizedDeps } from "./excludeModuleExportFromOptimizedDeps";
import { transformCreateFileRoute } from "./transformCreateFileRoute";

export type OidcSpaVitePluginParams = Omit<Param0<typeof oidcEarlyInit>, "isPostLoginRedirectManual">;

export function oidcSpa(params: OidcSpaVitePluginParams) {
    let loadHandleEntrypoint: ReturnType<typeof createLoadHandleEntrypoint> | undefined = undefined;

    const plugin: Plugin = {
        name: "oidc-spa",
        enforce: "pre",
        config(userConfig) {
            userConfig = excludeModuleExportFromOptimizedDeps({ userConfig });
            return userConfig;
        },
        configResolved(resolvedConfig) {
            loadHandleEntrypoint = createLoadHandleEntrypoint({
                oidcSpaVitePluginParams: params,
                resolvedConfig
            });
        },
        transform(code, id) {
            const transformed = transformCreateFileRoute({
                code,
                id
            });

            return transformed;
        },
        async load(id) {
            assert(loadHandleEntrypoint !== undefined);

            {
                const r = await loadHandleEntrypoint({
                    id,
                    pluginContext: this
                });

                if (r !== null) {
                    return r;
                }
            }

            return null;
        }
    };

    return plugin;
}
