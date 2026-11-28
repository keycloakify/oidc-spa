import type { Plugin } from "vite";
import { assert, type Equals } from "../tools/tsafe/assert";
import type { ApiName } from "../core/earlyInit_browserRuntimeFreeze";
import type { Handlers } from "./handlers";
import { createSharedHandlers } from "./createSharedHandlers";
import { createTanstackStartHandlers } from "./tanstack-start/createHandlers";
import { createReactRouterFrameworkHandlers } from "./react-router-framework/createHandlers";
import { configureDependencyOptimization } from "./manageOptimizedDeps";
import { getProjectType, type ProjectType } from "./projectType";

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

    /**
     * Advanced deployment escape hatch. Leave unset in most applications; configure
     * only when following the deployment setup of a supported oidc-spa example.
     *
     * Defaults to true for TanStack Start and false otherwise. Write a temporary
     * return-URL cookie for the server integration to render the post-login page
     * before hydration. Forces response_mode=query so the server sees the state.
     * Set to false for a statically served frontend. This option does not control
     * SSR or prerendering; configure those in your framework.
     */
    enableRoutingCookie?: boolean;

    /**
     * Advanced deployment escape hatch. Leave unset in most applications; configure
     * only when following the deployment setup of a supported oidc-spa example.
     *
     * Callback path relative to Vite's base. Defaults to "/" (application home).
     * For example, "/openid-callback/" under base "/dashboard/" registers
     * "https://your-app.example/dashboard/openid-callback/" with your provider.
     * Must start and end with "/", contain no query or fragment, and stay within
     * the application base. No application route is needed, but the server or CDN
     * must serve the application's HTML at this URL. Static prerendered frontends
     * should route a dedicated callback path to their neutral app shell.
     */
    redirectUriPath?: string;
};

export function oidcSpa(params: OidcSpaVitePluginParams = {}): Plugin {
    let handlers: Handlers | undefined;
    let projectType: ProjectType | undefined;
    const plugin: Plugin = {
        name: "oidc-spa",
        enforce: "pre",
        config(userConfig) {
            return configureDependencyOptimization(userConfig);
        },
        configResolved(resolvedConfig) {
            projectType = getProjectType({
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
        applyToEnvironment(environment) {
            // Nuxt can share its entry module between the client and SSR environments.
            // Only the browser entry should run early initialization.
            return projectType !== "nuxt" || environment.name === "client";
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
