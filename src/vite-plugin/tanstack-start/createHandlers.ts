import { createHandleClientEntrypoint } from "../handleClientEntrypoint";
import type { Handlers, HandlerFactoryParams } from "../handlers";
import { createHandleTanStackStartServerEntrypoint } from "./createHandleTanStackStartServerEntrypoint";
import { createHandleTanstackStartClientOutput } from "./handleTanstackStartClientOutput";
import { createHandleTanstackStartRuntimeConfigs } from "./handleTanstackStartRuntimeConfigs";
import { transformCreateFileRoute } from "./transformTanstackRouterCreateFileRoute";

export function createTanstackStartHandlers(params: HandlerFactoryParams): Handlers {
    const { resolvedConfig } = params;
    const clientEntrypoint = createHandleClientEntrypoint({
        ...params,
        projectType: "tanstack-start"
    });
    const runtimeConfigs = createHandleTanstackStartRuntimeConfigs({ resolvedConfig });
    const serverEntrypoint = createHandleTanStackStartServerEntrypoint({ resolvedConfig });
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
        configureServer: runtimeConfigs.configureServer
    };
}
