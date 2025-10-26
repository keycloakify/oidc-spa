export type ProjectType = "tanstack-start" | "react-router-framework" | "other";

type ResolvedConfigLike = {
    plugins: readonly { name: string }[];
};

export function detectProjectType(params: { resolvedConfig: ResolvedConfigLike }): ProjectType {
    const { resolvedConfig } = params;
    const pluginNames = new Set(resolvedConfig.plugins.map(plugin => plugin.name));

    if (pluginNames.has("tanstack-react-start:config")) {
        return "tanstack-start";
    }

    if (
        pluginNames.has("react-router") ||
        Array.from(pluginNames).some(pluginName => pluginName.startsWith("react-router:"))
    ) {
        return "react-router-framework";
    }

    return "other";
}
