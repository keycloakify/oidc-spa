export type ProjectType = "tanstack-start" | "react-router-framework" | "nuxt" | "other";

export function getProjectType(params: { pluginNames: string[] }) {
    const pluginNames = new Set(params.pluginNames);

    if (pluginNames.has("tanstack-react-start:config")) {
        return "tanstack-start";
    }

    if (
        pluginNames.has("react-router") ||
        Array.from(pluginNames).some(pluginName => pluginName.startsWith("react-router:"))
    ) {
        return "react-router-framework";
    }

    // Nuxt 4.5's builder uses nuxt:environments instead of nuxt:vite-node-server in production.
    // The broader "nuxt:" namespace is not framework-specific: standalone plugins such as
    // @nuxt/ui use it in ordinary Vite applications too.
    if (pluginNames.has("nuxt:vite-node-server") || pluginNames.has("nuxt:environments")) {
        return "nuxt";
    }

    return "other";
}
