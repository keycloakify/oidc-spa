import type { Plugin } from "vite";
import { assert, type Equals } from "../tools/tsafe/assert";
import type { ApiName } from "../core/earlyInit_browserRuntimeFreeze";
import type { Handlers } from "./handlers";
import { createSharedHandlers } from "./createSharedHandlers";
import { createTanstackStartHandlers } from "./tanstack-start/createHandlers";
import { createReactRouterFrameworkHandlers } from "./react-router-framework/createHandlers";
import { configureDependencyOptimization } from "./manageOptimizedDeps";
import { getProjectType } from "./projectType";

export type OidcSpaVitePluginParams = {
    /** See: https://docs.oidc-spa.dev/v/v10/security-features/browser-runtime-freeze */
    browserRuntimeFreeze?:
        | false
        | {
              enabled: true;
              excludes?: ApiName[];
          };
    /** See: https://docs.oidc-spa.dev/v/v10/security-features/token-substitution */
    tokenSubstitution?:
        | false
        | {
              enabled: true;
              trustedExternalResourceServers?: string[];
              trustedExternalServiceWorkerSources?: string[];
          };
    /** See: https://docs.oidc-spa.dev/v/v10/security-features/DPoP */
    DPoP?:
        | false
        | {
              enabled: true;
              mode: "auto" | "enforced";
          };
};

export function oidcSpa(params: OidcSpaVitePluginParams = {}) {
    let handlers: Handlers | undefined;

    const plugin: Plugin = {
        name: "oidc-spa",
        enforce: "pre",
        config(userConfig) {
            return configureDependencyOptimization(userConfig);
        },
        configResolved(resolvedConfig) {
            const projectType = getProjectType({
                pluginNames: resolvedConfig.plugins.map(({ name }) => name)
            });
            const factoryParams = { resolvedConfig, oidcSpaVitePluginParams: params };

            switch (projectType) {
                case "tanstack-start":
                    handlers = createTanstackStartHandlers(factoryParams);
                    break;
                case "react-router-framework":
                    handlers = createReactRouterFrameworkHandlers(factoryParams);
                    break;
                case "nuxt":
                case "other":
                    handlers = createSharedHandlers({ ...factoryParams, projectType });
                    break;
                default:
                    assert<Equals<typeof projectType, never>>(false);
            }
        },
        resolveId(id, importer, options) {
            assert(handlers !== undefined);
            return handlers.resolveId?.call(this, id, importer, options) ?? null;
        },
        load(id, options) {
            assert(handlers !== undefined);
            return handlers.load?.call(this, id, options) ?? null;
        },
        transform(code, id, options) {
            assert(handlers !== undefined);
            return handlers.transform?.call(this, code, id, options) ?? null;
        },
        buildStart(options) {
            assert(handlers !== undefined);
            return handlers.buildStart?.call(this, options);
        },
        configureServer(server) {
            assert(handlers !== undefined);
            return handlers.configureServer?.call(this, server);
        },
        generateBundle: {
            order: "pre",
            handler(options, bundle, isWrite) {
                assert(handlers !== undefined);
                return handlers.generateBundle?.call(this, options, bundle, isWrite);
            }
        }
    };

    return plugin;
}
