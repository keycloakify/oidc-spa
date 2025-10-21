import type { ResolvedConfig } from "vite";

export type ProjectType = "tanstack-start" | "react-router-framework" | "other";

const TANSTACK_PLUGIN_NAME = "tanstack-react-start:config";
const REACT_ROUTER_PLUGIN_NAME = "react-router";

export function detectProjectType(config: ResolvedConfig): ProjectType {
    const pluginNames = new Set(
        config.plugins
            .map(plugin => plugin?.name)
            .filter((name): name is string => typeof name === "string")
    );

    if (pluginNames.has(TANSTACK_PLUGIN_NAME)) {
        return "tanstack-start";
    }

    if (pluginNames.has(REACT_ROUTER_PLUGIN_NAME)) {
        return "react-router-framework";
    }

    return "other";
}
