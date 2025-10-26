import type { Plugin, TransformResult } from "vite";
import { assert } from "../tools/tsafe/assert";
import type { Param0 } from "../tools/tsafe/Param0";
import type { oidcEarlyInit } from "../entrypoint";
import { createLoadHandleEntrypoint } from "./handleClientEntrypoint";
import { excludeModuleExportFromOptimizedDeps } from "./excludeModuleExportFromOptimizedDeps";
import { transformCreateFileRoute } from "./transformTanstackRouterCreateFileRoute";
import { detectProjectType, type ProjectType } from "./detectProjectType";

export type OidcSpaVitePluginParams = Omit<
    Param0<typeof oidcEarlyInit>,
    "isPostLoginRedirectManual" | "BASE_URL"
>;

export function oidcSpa(
    params: OidcSpaVitePluginParams = {
        freezeFetch: true,
        freezeXMLHttpRequest: true,
        freezeWebSocket: true
    }
) {
    let loadHandleEntrypoint: ReturnType<typeof createLoadHandleEntrypoint> | undefined = undefined;

    let projectType: ProjectType | undefined = undefined;

    const plugin: Plugin = {
        name: "oidc-spa",
        enforce: "pre",
        config(userConfig) {
            userConfig = excludeModuleExportFromOptimizedDeps({ userConfig });
            return userConfig;
        },
        configResolved(resolvedConfig) {
            projectType = detectProjectType({ resolvedConfig });

            loadHandleEntrypoint = createLoadHandleEntrypoint({
                oidcSpaVitePluginParams: params,
                resolvedConfig
            });
        },
        transform(code, id) {
            let transformed: TransformResult | null = null;

            assert(projectType !== undefined);

            tanstack_start_specific_transformations: {
                if (projectType !== "tanstack-start") {
                    break tanstack_start_specific_transformations;
                }

                transformed = transformCreateFileRoute({
                    code,
                    id
                });
            }

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
