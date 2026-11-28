import type { NextConfig } from "next";
import { PHASE_DEVELOPMENT_SERVER, PHASE_PRODUCTION_BUILD } from "next/constants.js";
import { generateProxy } from "./generateProxy";
import type { ApiName } from "../core/earlyInit_browserRuntimeFreeze";

export type OidcSpaNextjsPluginParams = {
    /** Optional custom proxy module, relative to the project root. Keep its config export in that module. */
    proxy?: string;
    /** Defaults to process.cwd(). Set this when invoking Next from outside the app directory. */
    projectRoot?: string;
    /**
     * Callback path relative to the application base path. Defaults to "/":
     * the application home is the redirect URI. For example, "/openid-callback/"
     * uses that subpath beneath Next's basePath. Register the resulting URL with
     * your identity provider; the plugin handles it without an application route.
     * Must start and end with "/" and contain no query parameters or fragment.
     */
    redirectUriPath?: string;
    /** Next.js requires the Array prototype to remain mutable for its RSC chunk queue. */
    browserRuntimeFreeze?: false | { enabled: true; excludes?: ApiName[] };
    tokenSubstitution?:
        | false
        | {
              enabled: true;
              trustedExternalResourceServers?: string[];
              trustedExternalServiceWorkerSources?: string[];
          };
    DPoP?: false | { enabled: true; mode: "auto" | "enforced" };
};

type ConfigFunction = (
    phase: string,
    context: { defaultConfig: NextConfig }
) => NextConfig | Promise<NextConfig>;

/** Requires Next.js 16.3 or later. Generates proxy.ts during development and production builds. */
export function withOidcSpa(
    config: NextConfig | ConfigFunction = {},
    params: OidcSpaNextjsPluginParams = {}
): ConfigFunction {
    return async (phase, context) => {
        const nextConfig = typeof config === "function" ? await config(phase, context) : config;
        const { browserRuntimeFreeze, DPoP, tokenSubstitution, redirectUriPath = "/" } = params;

        const result: NextConfig = {
            ...nextConfig,
            // The callback ends in '/', including when it is the application home.
            // Preserve it until earlyInit can consume the authorization response.
            ...(!nextConfig.trailingSlash ? { skipTrailingSlashRedirect: true } : {}),
            instrumentationClientInject: [
                "oidc-spa/nextjs-plugin/client",
                ...(nextConfig.instrumentationClientInject ?? [])
            ],
            env: {
                ...nextConfig.env,
                OIDC_SPA_NEXTJS_BASE_URL: `${nextConfig.basePath ?? ""}/`,
                OIDC_SPA_NEXTJS_REDIRECT_URI_PATH: redirectUriPath,
                OIDC_SPA_NEXTJS_BROWSER_RUNTIME_FREEZE: JSON.stringify(
                    browserRuntimeFreeze
                        ? { excludes: [...new Set(["Array", ...(browserRuntimeFreeze.excludes ?? [])])] }
                        : false
                ),
                OIDC_SPA_NEXTJS_DPOP: JSON.stringify(DPoP ? { mode: DPoP.mode } : false),
                OIDC_SPA_NEXTJS_TOKEN_SUBSTITUTION: JSON.stringify(
                    tokenSubstitution
                        ? {
                              trustedExternalResourceServers:
                                  tokenSubstitution.trustedExternalResourceServers,
                              trustedExternalServiceWorkerSources:
                                  tokenSubstitution.trustedExternalServiceWorkerSources
                          }
                        : false
                )
            }
        };

        if (phase === PHASE_DEVELOPMENT_SERVER || phase === PHASE_PRODUCTION_BUILD) {
            await generateProxy({
                projectRoot: params.projectRoot ?? process.cwd(),
                nextConfig: result,
                proxy: params.proxy,
                isDev: phase === PHASE_DEVELOPMENT_SERVER
            });
        }

        return result;
    };
}
