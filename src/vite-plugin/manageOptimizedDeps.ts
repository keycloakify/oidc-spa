import type { UserConfig } from "vite";
import { getThisCodebaseRootDirPath } from "../tools/getThisCodebaseRootDirPath_cjs";
import * as fs from "node:fs";
import { join as pathJoin } from "path";
import type { ProjectType } from "./projectType";
import { assert } from "../tools/tsafe/assert";

export function manageOptimizedDeps(params: {
    userConfig: UserConfig;
    projectType: ProjectType;
}): UserConfig {
    const { userConfig, projectType } = params;

    const packageJsonParsed = JSON.parse(
        fs.readFileSync(pathJoin(getThisCodebaseRootDirPath(), "package.json")).toString("utf8")
    ) as { name: string; exports: Record<string, { module?: string }> };

    const moduleNames = Object.entries(packageJsonParsed.exports)
        .filter(([, value]) => value.module !== undefined)
        .map(([key]) => key.replace(/^\./, packageJsonParsed.name));

    switch (projectType) {
        case "other":
        case "tanstack-start":
            {
                ((userConfig.optimizeDeps ??= {}).exclude ??= []).push(...[...moduleNames, "zod"]);
            }
            break;
        case "react-router-framework":
            {
                const moduleNames_include = [
                    "oidc-spa/react-spa",
                    "oidc-spa/entrypoint",
                    "oidc-spa/keycloak",
                    "oidc-spa/core"
                ];

                for (const moduleName of moduleNames_include) {
                    assert(moduleNames.includes(moduleName));
                }

                const isZodInstalled = (() => {
                    try {
                        require.resolve(`zod/package.json`);
                    } catch {
                        return false;
                    }

                    return true;
                })();

                if (isZodInstalled) {
                    moduleNames_include.push("zod");
                }

                moduleNames_include.push("oidc-spa");

                ((userConfig.optimizeDeps ??= {}).include ??= []).push(...moduleNames_include);
            }
            break;
    }

    return userConfig;
}
