import type { Plugin, TransformResult } from "vite";
import { assert } from "../tools/tsafe/assert";
import type { ApiName } from "../core/earlyInit_browserRuntimeFreeze";
import { createHandleClientEntrypoint } from "./handleClientEntrypoint";
import { createHandleServerEntrypoint } from "./handleServerEntrypoint";
import { manageOptimizedDeps } from "./manageOptimizedDeps";
import { transformCreateFileRoute } from "./transformTanstackRouterCreateFileRoute";
import { getProjectType, type ProjectType } from "./projectType";
import { createHandleTanstackStartClientOutput } from "./handleTanstackStartClientOutput";

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
     * Determines how session restoration is handled.
     * Session restoration allows users to stay logged in between visits
     * without needing to explicitly sign in each time.
     *
     * Options:
     *
     * - **"auto" (default)**:
     *   Automatically selects the best method.
     *   If the app’s domain shares a common parent domain with the authorization endpoint,
     *   an iframe is used for silent session restoration.
     *   Otherwise, a full-page redirect is used.
     *
     * - **"full page redirect"**:
     *   Forces full-page reloads for session restoration.
     *   Use this if your application is served with a restrictive CSP
     *   (e.g., `Content-Security-Policy: frame-ancestors "none"`)
     *   or `X-Frame-Options: DENY`, and you cannot modify those headers.
     *   This mode provides a slightly less seamless UX and will lead oidc-spa to
     *   store tokens in `localStorage` if multiple OIDC clients are used
     *   (e.g., your app communicates with several APIs).
     *
     * - **"iframe"**:
     *   Forces iframe-based session restoration.
     *   In development, if you go in your browser setting and allow your auth server’s domain
     *   to set third-party cookies this value will let you test your app
     *   with the local dev server as it will behave in production.
     *
     *  See: https://docs.oidc-spa.dev/v/v10/resources/third-party-cookies-and-session-restoration
     */
    sessionRestorationMethod?: "iframe" | "full page redirect" | "auto";
};

export function oidcSpa(params: OidcSpaVitePluginParams = {}) {
    let load_handleClientEntrypoint:
        | ReturnType<typeof createHandleClientEntrypoint>["load_handleClientEntrypoint"]
        | undefined = undefined;
    let resolveId_handleTanstackStartClientOutput:
        | ReturnType<typeof createHandleTanstackStartClientOutput>["resolveId"]
        | undefined = undefined;
    let load_handleTanstackStartClientOutput:
        | ReturnType<typeof createHandleTanstackStartClientOutput>["load"]
        | undefined = undefined;
    let buildStart_handleTanstackStartClientOutput:
        | ReturnType<typeof createHandleTanstackStartClientOutput>["buildStart"]
        | undefined = undefined;
    let generateBundle_handleTanstackStartClientOutput:
        | ReturnType<typeof createHandleTanstackStartClientOutput>["generateBundle"]
        | undefined = undefined;
    let tanstackStartApplicationEntryBuildMarker: string | undefined = undefined;
    let load_handleServerEntrypoint:
        | ReturnType<typeof createHandleServerEntrypoint>["load_handleServerEntrypoint"]
        | undefined = undefined;

    let projectType: ProjectType | undefined = undefined;
    let isBuild = false;

    const plugin: Plugin = {
        name: "oidc-spa",
        enforce: "pre",
        config(userConfig) {
            const projectType = getProjectType({
                pluginNames:
                    userConfig.plugins
                        ?.flat()
                        .filter(plugin => plugin instanceof Object)
                        .filter(plugin => "name" in plugin)
                        .map(plugin => plugin.name) ?? []
            });

            userConfig = manageOptimizedDeps({ userConfig, projectType });
            return userConfig;
        },
        configResolved(resolvedConfig) {
            isBuild = resolvedConfig.command === "build";
            projectType = getProjectType({
                pluginNames: resolvedConfig.plugins.map(({ name }) => name)
            });

            const clientEntrypointHandler = createHandleClientEntrypoint({
                oidcSpaVitePluginParams: params,
                resolvedConfig,
                projectType
            });

            load_handleClientEntrypoint = clientEntrypointHandler.load_handleClientEntrypoint;

            if (projectType === "tanstack-start" && isBuild) {
                const tanstackStartClientOutputHandler = createHandleTanstackStartClientOutput({
                    resolvedConfig,
                    getClientEntrypointSource: clientEntrypointHandler.getClientEntrypointSource
                });

                resolveId_handleTanstackStartClientOutput = tanstackStartClientOutputHandler.resolveId;
                load_handleTanstackStartClientOutput = tanstackStartClientOutputHandler.load;
                buildStart_handleTanstackStartClientOutput = tanstackStartClientOutputHandler.buildStart;
                generateBundle_handleTanstackStartClientOutput =
                    tanstackStartClientOutputHandler.generateBundle;
                tanstackStartApplicationEntryBuildMarker =
                    tanstackStartClientOutputHandler.applicationEntryBuildMarker;
            }

            load_handleServerEntrypoint = createHandleServerEntrypoint({
                resolvedConfig,
                projectType
            }).load_handleServerEntrypoint;
        },
        transform(code, id) {
            let transformed: TransformResult | null = null;

            assert(projectType !== undefined);

            tanstack_start_specific_transformations: {
                if (projectType !== "tanstack-start") {
                    break tanstack_start_specific_transformations;
                }

                transformed = transformCreateFileRoute({
                    code,
                    id
                });
            }

            return transformed;
        },
        resolveId(id) {
            return resolveId_handleTanstackStartClientOutput?.(id) ?? null;
        },
        buildStart() {
            buildStart_handleTanstackStartClientOutput?.call(this);
        },
        async load(id) {
            {
                const r = load_handleTanstackStartClientOutput?.(id) ?? null;

                if (r !== null) {
                    return r;
                }
            }

            {
                assert(load_handleClientEntrypoint !== undefined);

                const doUseOriginalEntrypoint =
                    projectType === "tanstack-start" &&
                    isBuild &&
                    ((this as typeof this & { environment?: { name?: string } }).environment?.name ??
                        "client") === "client";

                const r = await load_handleClientEntrypoint({
                    id,
                    pluginContext: this,
                    doUseOriginalEntrypoint,
                    buildMarker: doUseOriginalEntrypoint
                        ? tanstackStartApplicationEntryBuildMarker
                        : undefined
                });

                if (r !== null) {
                    return r;
                }
            }

            {
                assert(load_handleServerEntrypoint !== undefined);

                const r = await load_handleServerEntrypoint({
                    id,
                    pluginContext: this
                });

                if (r !== null) {
                    return r;
                }
            }
            return null;
        },
        generateBundle: {
            order: "pre",
            async handler(options, bundle) {
                await generateBundle_handleTanstackStartClientOutput?.call(this, options, bundle);
            }
        }
    };

    return plugin;
}
