import { getIsOidcSpaStateUrlParamValue } from "../../core/StateData";
import { createHandleClientEntrypoint } from "../handleClientEntrypoint";
import type { Handlers, HandlerFactoryParams } from "../handlers";
import { createHandleTanStackStartServerEntrypoint } from "./createHandleTanStackStartServerEntrypoint";
import { createHandleTanstackStartClientOutput } from "./handleTanstackStartClientOutput";
import { createHandleTanstackStartRuntimeConfigs } from "./handleTanstackStartRuntimeConfigs";
import { getSpaPaths } from "./spaRouting";
import { transformCreateFileRoute } from "./transformTanstackRouterCreateFileRoute";
import { configureTanstackStartPreview } from "./configurePreviewServer";

export function createTanstackStartHandlers(params: HandlerFactoryParams): Handlers {
    const { resolvedConfig, oidcSpaVitePluginParams } = params;

    const clientEntrypoint = createHandleClientEntrypoint({
        oidcSpaVitePluginParams,
        resolvedConfig,
        projectType: "tanstack-start"
    });
    const runtimeConfigs = createHandleTanstackStartRuntimeConfigs({ resolvedConfig });
    const serverEntrypoint = createHandleTanStackStartServerEntrypoint({
        resolvedConfig,
        oidcSpaVitePluginParams
    });
    const clientOutput =
        resolvedConfig.command === "build"
            ? createHandleTanstackStartClientOutput({
                  resolvedConfig,
                  getClientEntrypointSource: clientEntrypoint.getClientEntrypointSource
              })
            : undefined;

    return {
        resolveId(id) {
            return runtimeConfigs.resolveId(id) ?? clientOutput?.resolveId(id) ?? null;
        },
        async load(id) {
            const runtimeConfigSource = await runtimeConfigs.load(id, this);
            if (runtimeConfigSource !== null) return runtimeConfigSource;

            const bootstrapSource = clientOutput?.load(id);
            if (bootstrapSource !== null && bootstrapSource !== undefined) return bootstrapSource;

            const doUseOriginalEntrypoint =
                clientOutput !== undefined &&
                ((this as typeof this & { environment?: { name?: string } }).environment?.name ??
                    "client") === "client";
            const clientSource = await clientEntrypoint.load_handleClientEntrypoint({
                id,
                pluginContext: this,
                doUseOriginalEntrypoint,
                buildMarker: doUseOriginalEntrypoint
                    ? clientOutput?.applicationEntryBuildMarker
                    : undefined
            });
            if (clientSource !== null) return clientSource;

            return serverEntrypoint.load_handleServerEntrypoint({ id, pluginContext: this });
        },
        transform(code, id) {
            return transformCreateFileRoute({ code, id });
        },
        buildStart: clientOutput?.buildStart,
        generateBundle: clientOutput?.generateBundle,
        configureServer(server) {
            runtimeConfigs.configureServer(server);
            if (resolvedConfig.define?.["import.meta.env.TSS_SHELL"] !== JSON.stringify("true")) return;

            const { basePath, callback } = getSpaPaths(
                resolvedConfig.base,
                oidcSpaVitePluginParams.redirectUriPath
            );
            server.middlewares.use((req, _res, next) => {
                if (
                    (req.method === "GET" || req.method === "HEAD") &&
                    req.url?.split("?", 1)[0] === callback &&
                    (callback !== basePath ||
                        getIsOidcSpaStateUrlParamValue({
                            maybeStateUrlParamValue:
                                new URL(req.url, "http://localhost").searchParams.get("state") ?? ""
                        }))
                ) {
                    // Start renders a live shell in SPA dev mode, but still
                    // canonicalizes the callback's trailing slash. Render at the
                    // app root internally; earlyInit reads the untouched browser
                    // URL. Dropping the query also bypasses SSR callback handling.
                    req.url = basePath;
                    // Start's standalone dev handler restores this before dispatch.
                    req.originalUrl = basePath;
                }
                next();
            });
        },
        configurePreviewServer: server =>
            configureTanstackStartPreview(server, oidcSpaVitePluginParams.redirectUriPath)
    };
}
