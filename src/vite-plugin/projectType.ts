export type ProjectType = "tanstack-start" | "react-router-framework" | "other";

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

    return "other";
}
