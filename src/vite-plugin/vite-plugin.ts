import type { Plugin } from "vite";
import { assert, type Equals } from "../tools/tsafe/assert";
import type { ApiName } from "../core/earlyInit_browserRuntimeFreeze";
import { createHandleClientEntrypoint } from "./handleClientEntrypoint";
import { createHandleServerEntrypoint } from "./handleServerEntrypoint";
import { manageOptimizedDeps } from "./manageOptimizedDeps";
import { transformCreateFileRoute } from "./transformTanstackRouterCreateFileRoute";
import { getProjectType, type ProjectType } from "./projectType";
import { createHandleTanstackStartClientOutput } from "./handleTanstackStartClientOutput";
import { createHandleTanstackStartRuntimeConfigs } from "./handleTanstackStartRuntimeConfigs";
import { createHandleReactRouter } from "./handleReactRouter";

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
    let isReactRouterChildCompiler = false;
    let runtimeConfigsHandler: ReturnType<typeof createHandleTanstackStartRuntimeConfigs> | undefined;
    let reactRouterHandler: ReturnType<typeof createHandleReactRouter> | undefined;

    const plugin: Plugin = {
        name: "oidc-spa",
        enforce: "pre",
        config(userConfig) {
            handle_manageOptizedDps: {
                const pluginNames = (() => {
                    if (userConfig.plugins === undefined) {
                        return [];
                    }

                    const pluginNames = userConfig.plugins
                        .flat()
                        .filter(plugin => plugin instanceof Object)
                        .filter(plugin => "name" in plugin)
                        .map(plugin => plugin.name);

                    return pluginNames;
                })();

                if (
                    (userConfig as { configFile?: string | false }).configFile === false &&
                    pluginNames.includes("react-router:virtual-modules")
                ) {
                    break handle_manageOptizedDps;
                }

                const projectType_bestEffort = getProjectType({
                    pluginNames
                });

                const userConfig_modified = manageOptimizedDeps({
                    userConfig,
                    projectType: projectType_bestEffort
                });

                return userConfig_modified;
            }
        },
        configResolved(resolvedConfig) {
            isBuild = resolvedConfig.command === "build";
            projectType = getProjectType({
                pluginNames: resolvedConfig.plugins.map(({ name }) => name)
            });
            // RR creates a second compiler containing only its auxiliary plugins.
            // It analyzes exports; it must not install another document/bootstrap pipeline.
            isReactRouterChildCompiler =
                projectType === "react-router-framework" &&
                !resolvedConfig.configFile &&
                resolvedConfig.plugins.some(plugin => plugin.name === "react-router:virtual-modules");

            if (isReactRouterChildCompiler) return;

            if (projectType === "tanstack-start") {
                runtimeConfigsHandler = createHandleTanstackStartRuntimeConfigs({ resolvedConfig });
            }

            const clientEntrypointHandler = createHandleClientEntrypoint({
                oidcSpaVitePluginParams: params,
                resolvedConfig,
                projectType
            });

            load_handleClientEntrypoint = clientEntrypointHandler.load_handleClientEntrypoint;

            if (projectType === "react-router-framework") {
                reactRouterHandler = createHandleReactRouter({
                    resolvedConfig,
                    getClientEntrypointSource: clientEntrypointHandler.getClientEntrypointSource
                });
            }

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
            assert(projectType !== undefined);

            switch (projectType) {
                case "react-router-framework":
                    if (isReactRouterChildCompiler) {
                        break;
                    }
                    assert(reactRouterHandler !== undefined);
                    return reactRouterHandler.transform(code, id);
                case "tanstack-start":
                    return transformCreateFileRoute({
                        code,
                        id
                    });
                case "nuxt":
                case "other":
                    break;
                default:
                    assert<Equals<typeof projectType, never>>(false);
            }

            return null;
        },
        resolveId(id) {
            return (
                runtimeConfigsHandler?.resolveId(id) ??
                reactRouterHandler?.resolveId(id) ??
                resolveId_handleTanstackStartClientOutput?.(id) ??
                null
            );
        },
        buildStart() {
            buildStart_handleTanstackStartClientOutput?.call(this);
            reactRouterHandler?.buildStart.call(this);
        },
        configureServer(server) {
            runtimeConfigsHandler?.configureServer(server);
            reactRouterHandler?.configureServer(server);
        },
        async load(id) {
            if (isReactRouterChildCompiler) return null;
            {
                const r = await reactRouterHandler?.load(id);
                if (r !== null && r !== undefined) return r;
            }
            {
                const r = await runtimeConfigsHandler?.load(id, this);
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
                    projectType === "react-router-framework" ||
                    (projectType === "tanstack-start" &&
                        isBuild &&
                        ((this as typeof this & { environment?: { name?: string } }).environment?.name ??
                            "client") === "client");

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
                reactRouterHandler?.generateBundle.call(this, options, bundle);
            }
        }
    };

    return plugin;
}
