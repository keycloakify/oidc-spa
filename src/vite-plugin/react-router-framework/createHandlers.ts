import { createHandleClientEntrypoint } from "../handleClientEntrypoint";
import type { Handlers, HandlerFactoryParams } from "../handlers";
import { createHandleReactRouter } from "./handleReactRouter";

export function createReactRouterFrameworkHandlers(params: HandlerFactoryParams): Handlers {
    const { resolvedConfig } = params;
    // RR's export-analysis compiler uses auxiliary plugins without a config file.
    // Keep its framework identity, but leave that compilation phase untouched.
    const isChildCompiler =
        !resolvedConfig.configFile &&
        resolvedConfig.plugins.some(plugin => plugin.name === "react-router:virtual-modules");
    if (isChildCompiler) return {};

    const clientEntrypoint = createHandleClientEntrypoint({
        ...params,
        projectType: "react-router-framework"
    });
    const document = createHandleReactRouter({
        resolvedConfig,
        getClientEntrypointSource: clientEntrypoint.getClientEntrypointSource
    });

    return {
        ...document,
        async load(id) {
            const source = document.load(id);
            if (source !== null) return source;

            return clientEntrypoint.load_handleClientEntrypoint({
                id,
                pluginContext: this,
                doUseOriginalEntrypoint: true
            });
        }
    };
}
