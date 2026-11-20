import type { NextConfig } from "next";
import { PHASE_DEVELOPMENT_SERVER, PHASE_PRODUCTION_BUILD } from "next/constants.js";
import type { OidcSpaNextjsPluginParams } from "./types";
import { generateProxy } from "./generateProxy";

export type { OidcSpaNextjsPluginParams };

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
        const { browserRuntimeFreeze, DPoP, tokenSubstitution } = params;

        const result: NextConfig = {
            ...nextConfig,
            // OIDC redirect URIs end in '/'. Next's default redirect would remove it
            // from a non-empty basePath before earlyInit can consume the callback.
            ...(nextConfig.basePath && !nextConfig.trailingSlash
                ? { skipTrailingSlashRedirect: true }
                : {}),
            instrumentationClientInject: [
                "oidc-spa/nextjs-plugin/client",
                ...(nextConfig.instrumentationClientInject ?? [])
            ],
            env: {
                ...nextConfig.env,
                OIDC_SPA_NEXTJS_BASE_URL: `${nextConfig.basePath ?? ""}/`,
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
