import { createHandleClientEntrypoint } from "../handleClientEntrypoint";
import type { Handlers, HandlerFactoryParams } from "../handlers";
import { createHandleTanStackStartServerEntrypoint } from "./createHandleTanStackStartServerEntrypoint";
import { createHandleTanstackStartClientOutput } from "./handleTanstackStartClientOutput";
import { createHandleTanstackStartRuntimeConfigs } from "./handleTanstackStartRuntimeConfigs";
import { transformCreateFileRoute } from "./transformTanstackRouterCreateFileRoute";

export function createTanstackStartHandlers(params: HandlerFactoryParams): Handlers {
    const { resolvedConfig, oidcSpaVitePluginParams } = params;

    // TODO: Here it depends if we are building for static
    // rendering (a _shell.html is generated) then we should
    // set this to false.
    // otherwise to true.
    // basically if src/tanstack-start-react/withOidcSpaServerEntry.ts is
    // gonna run then true otherwise false.
    const ssr: boolean = TODO;

    if (oidcSpaVitePluginParams.useLegacyRedirectUri === true && !ssr) {
        throw new Error(
            [
                "oidc-spa: useLegacyRedirectUri is not supported with TanStack Start in SPA mode.",
                "Remove useLegacyRedirectUri (or set it to false) and update the registered redirect URI",
                "in your IAM administration console to your application URL followed by openid-callback/",
                "(for example, https://myapp.mycompany.com/openid-callback/ or",
                "https://myapp.mycompany.com/dashboard/openid-callback/ if your base path is /dashboard/)."
            ].join(" ")
        );
    }

    const clientEntrypoint = createHandleClientEntrypoint({
        oidcSpaVitePluginParams,
        resolvedConfig,
        projectType: "tanstack-start",
        // TODO: Here it depends if we are building for static
        // rendering (a _shell.html is generated) then we should
        // set this to false.
        // otherwise to true.
        // basically if src/tanstack-start-react/withOidcSpaServerEntry.ts is
        // gonna run then true otherwise false.
        ssr: null
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
