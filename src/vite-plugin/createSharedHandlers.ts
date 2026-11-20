import { createHandleClientEntrypoint } from "./handleClientEntrypoint";
import type { Handlers, HandlerFactoryParams } from "./handlers";

export function createSharedHandlers(
    params: HandlerFactoryParams & { projectType: "nuxt" | "other" }
): Handlers {
    const clientEntrypoint = createHandleClientEntrypoint(params);

    return {
        load(id) {
            return clientEntrypoint.load_handleClientEntrypoint({
                id,
                pluginContext: this,
                doUseOriginalEntrypoint: false
            });
        }
    };
}
