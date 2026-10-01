import type { Plugin, TransformResult } from "vite";
import { assert } from "../tools/tsafe/assert";
import type { ApiName } from "../core/earlyInit_browserRuntimeFreeze";
import { createHandleClientEntrypoint } from "./handleClientEntrypoint";
import { createHandleServerEntrypoint } from "./handleServerEntrypoint";
import { manageOptimizedDeps } from "./manageOptimizedDeps";
import { transformCreateFileRoute } from "./transformTanstackRouterCreateFileRoute";
import { getProjectType, type ProjectType } from "./projectType";
import { createHandleTanstackStartClientOutput } from "./handleTanstackStartClientOutput";
import { createHandleTanstackStartBootstrapEnv } from "./handleTanstackStartBootstrapEnv";

export type OidcSpaVitePluginParams = {
    /** See: https://docs.oidc-spa.dev/v/v10/security-features/browser-runtime-freeze */
    browserRuntimeFreeze?:
        | false
        | {
              enabled: true;
              excludes?: ApiName[];
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
    let resolveId_handleTanstackStartClientOutput:
        | ReturnType<typeof createHandleTanstackStartClientOutput>["resolveId"]
        | undefined = undefined;
    let load_handleTanstackStartClientOutput:
        | ReturnType<typeof createHandleTanstackStartClientOutput>["load"]
        | undefined = undefined;
    let buildStart_handleTanstackStartClientOutput:
        | ReturnType<typeof createHandleTanstackStartClientOutput>["buildStart"]
        | undefined = undefined;
    let generateBundle_handleTanstackStartClientOutput:
        | ReturnType<typeof createHandleTanstackStartClientOutput>["generateBundle"]
        | undefined = undefined;
    let tanstackStartApplicationEntryBuildMarker: string | undefined = undefined;
    let load_handleServerEntrypoint:
        | ReturnType<typeof createHandleServerEntrypoint>["load_handleServerEntrypoint"]
        | undefined = undefined;

    let projectType: ProjectType | undefined = undefined;
    let isBuild = false;
    let bootstrapEnvHandler: ReturnType<typeof createHandleTanstackStartBootstrapEnv> | undefined;

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
            isBuild = resolvedConfig.command === "build";
            projectType = getProjectType({
                pluginNames: resolvedConfig.plugins.map(({ name }) => name)
            });

            if (projectType === "tanstack-start") {
                bootstrapEnvHandler = createHandleTanstackStartBootstrapEnv({ resolvedConfig });
            }

            const clientEntrypointHandler = createHandleClientEntrypoint({
                oidcSpaVitePluginParams: params,
                resolvedConfig,
                projectType
            });

            load_handleClientEntrypoint = clientEntrypointHandler.load_handleClientEntrypoint;

            if (projectType === "tanstack-start" && isBuild) {
                const tanstackStartClientOutputHandler = createHandleTanstackStartClientOutput({
                    resolvedConfig,
                    getClientEntrypointSource: clientEntrypointHandler.getClientEntrypointSource
                });

                resolveId_handleTanstackStartClientOutput = tanstackStartClientOutputHandler.resolveId;
                load_handleTanstackStartClientOutput = tanstackStartClientOutputHandler.load;
                buildStart_handleTanstackStartClientOutput = tanstackStartClientOutputHandler.buildStart;
                generateBundle_handleTanstackStartClientOutput =
                    tanstackStartClientOutputHandler.generateBundle;
                tanstackStartApplicationEntryBuildMarker =
                    tanstackStartClientOutputHandler.applicationEntryBuildMarker;
            }

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
        resolveId(id) {
            return (
                bootstrapEnvHandler?.resolveId(id) ??
                resolveId_handleTanstackStartClientOutput?.(id) ??
                null
            );
        },
        buildStart() {
            buildStart_handleTanstackStartClientOutput?.call(this);
        },
        configureServer(server) {
            bootstrapEnvHandler?.configureServer(server);
        },
        async load(id) {
            {
                const r = await bootstrapEnvHandler?.load(id, this);
                if (r !== null && r !== undefined) return r;
            }
            {
                const r = load_handleTanstackStartClientOutput?.(id) ?? null;

                if (r !== null) {
                    return r;
                }
            }

            {
                assert(load_handleClientEntrypoint !== undefined);

                const doUseOriginalEntrypoint =
                    projectType === "tanstack-start" &&
                    isBuild &&
                    ((this as typeof this & { environment?: { name?: string } }).environment?.name ??
                        "client") === "client";

                const r = await load_handleClientEntrypoint({
                    id,
                    pluginContext: this,
                    doUseOriginalEntrypoint,
                    buildMarker: doUseOriginalEntrypoint
                        ? tanstackStartApplicationEntryBuildMarker
                        : undefined
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
        },
        generateBundle: {
            order: "pre",
            async handler(options, bundle) {
                await generateBundle_handleTanstackStartClientOutput?.call(this, options, bundle);
            }
        }
    };

    return plugin;
}
