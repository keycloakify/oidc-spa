import type { UserConfig } from "vite";
import { getThisCodebaseRootDirPath } from "../tools/getThisCodebaseRootDirPath_cjs";
import * as fs from "node:fs";
import { join as pathJoin } from "path";

export function excludeModuleExportFromOptimizedDeps(params: { userConfig: UserConfig }): UserConfig {
    const { userConfig } = params;

    const packageJsonParsed = JSON.parse(
        fs.readFileSync(pathJoin(getThisCodebaseRootDirPath(), "package.json")).toString("utf8")
    ) as { name: string; exports: Record<string, { module?: string }> };

    const modules = Object.entries(packageJsonParsed.exports)
        .filter(([, value]) => value.module !== undefined)
        .map(([key]) => key.replace(/^\./, packageJsonParsed.name));

    ((userConfig.optimizeDeps ??= {}).exclude ??= []).push(...modules);

    return userConfig;
}
