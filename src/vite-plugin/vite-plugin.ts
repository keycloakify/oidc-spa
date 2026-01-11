import type { Plugin, TransformResult } from "vite";
import { assert } from "../tools/tsafe/assert";
import type { ApiName } from "../core/earlyInit_browserRuntimeFreeze";
import { createHandleClientEntrypoint } from "./handleClientEntrypoint";
import { createHandleServerEntrypoint } from "./handleServerEntrypoint";
import { manageOptimizedDeps } from "./manageOptimizedDeps";
import { transformCreateFileRoute } from "./transformTanstackRouterCreateFileRoute";
import { getProjectType, type ProjectType } from "./projectType";

export type OidcSpaVitePluginParams = {
    /** See: https://docs.oidc-spa.dev/v/v10/security-features/browser-runtime-freeze */
    browserRuntimeFreeze?:
        | false
        | {
              enabled: true;
              exclude?: ApiName[];
          };
    /** See: https://docs.oidc-spa.dev/v/v10/security-features/token-substitution */
    tokenSubstitution?:
        | false
        | {
              enabled: true;
              trustedExternalResourceServers?: string[];
              trustedExternalServiceWorkerSources?: string[];
          };
    /** See: https://docs.oidc-spa.dev/v/v10/security-features/DPoP */
    DPoP?:
        | false
        | {
              enabled: true;
              mode: "auto" | "enforced";
          };
};

export function oidcSpa(params: OidcSpaVitePluginParams = {}) {
    let load_handleClientEntrypoint:
        | ReturnType<typeof createHandleClientEntrypoint>["load_handleClientEntrypoint"]
        | undefined = undefined;
    let load_handleServerEntrypoint:
        | ReturnType<typeof createHandleServerEntrypoint>["load_handleServerEntrypoint"]
        | undefined = undefined;

    let projectType: ProjectType | undefined = undefined;

    const plugin: Plugin = {
        name: "oidc-spa",
        enforce: "pre",
        config(userConfig) {
            const projectType = getProjectType({
                pluginNames:
                    userConfig.plugins
                        ?.flat()
                        .filter(plugin => plugin instanceof Object)
                        .filter(plugin => "name" in plugin)
                        .map(plugin => plugin.name) ?? []
            });

            userConfig = manageOptimizedDeps({ userConfig, projectType });
            return userConfig;
        },
        configResolved(resolvedConfig) {
            projectType = getProjectType({
                pluginNames: resolvedConfig.plugins.map(({ name }) => name)
            });

            load_handleClientEntrypoint = createHandleClientEntrypoint({
                oidcSpaVitePluginParams: params,
                resolvedConfig,
                projectType
            }).load_handleClientEntrypoint;

            load_handleServerEntrypoint = createHandleServerEntrypoint({
                resolvedConfig,
                projectType
            }).load_handleServerEntrypoint;
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
            {
                assert(load_handleClientEntrypoint !== undefined);

                const r = await load_handleClientEntrypoint({
                    id,
                    pluginContext: this
                });

                if (r !== null) {
                    return r;
                }
            }

            {
                assert(load_handleServerEntrypoint !== undefined);

                const r = await load_handleServerEntrypoint({
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
