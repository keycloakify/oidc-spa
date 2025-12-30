import type { Plugin, TransformResult } from "vite";
import { assert } from "../tools/tsafe/assert";
import type { ApiName } from "../core/earlyInit_freezeBrowserRuntime";
import { createHandleClientEntrypoint } from "./handleClientEntrypoint";
import { createHandleServerEntrypoint } from "./handleServerEntrypoint";
import { manageOptimizedDeps } from "./manageOptimizedDeps";
import { transformCreateFileRoute } from "./transformTanstackRouterCreateFileRoute";
import { getProjectType, type ProjectType } from "./projectType";

export type OidcSpaVitePluginParams = {
    browserRuntimeFreeze?:
        | false
        | {
              enabled: true;
              exclude?: ApiName[];
          };
    /**
     * resourceServersAllowedHostnames:
     *
     * Example ["vault.domain2.net", "minio.domain2.net", "*.lab.domain3.net"]
     * Note that any domains first party relative to where your app
     * is deployed will be automatically allowed.
     *
     * So for example if your app is deployed under:
     * dashboard.my-company.com
     * Authed request to the following domains will automatically be allowed (examples):
     * - minio.my-company.com
     * - minio.dashboard.my-company.com
     * - my-company.com
     *
     * BUT there is an exception to the rule. If your app is deployed under free default domain
     * provided by known hosting platform like
     * - xxx.vercel.com
     * - xxx.netlify.com
     * - xxx.github.com
     * - xxx.pages.dev (firebase)
     * - xxx.web.app (firebase)
     * - ...
     *
     * We we won't allow request to parent domain since those are multi tenant.
     *
     * Also, all filtering will be disabled when the app is ran with the dev server, so under:
     * - localhost
     * - 127.0.0.1
     * - [::]
     * */
    tokenSubstitution?:
        | false
        | {
              enabled: true;
              resourceServersAllowedHostnames?: string[];
              serviceWorkersAllowedHostnames?: string[];
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
