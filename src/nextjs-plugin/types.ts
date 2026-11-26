import type { ApiName } from "../core/earlyInit_browserRuntimeFreeze";

export type OidcSpaNextjsPluginParams = {
    /** Optional custom proxy module, relative to the project root. Keep its config export in that module. */
    proxy?: string;
    /** Defaults to process.cwd(). Set this when invoking Next from outside the app directory. */
    projectRoot?: string;
    /**
     * Use the application home URL, including its base path, as the redirect URI
     * to preserve existing IAM registrations when migrating from oidc-spa v10.
     * Defaults to false: the redirect URI is /openid-callback/ under the base path.
     */
    useLegacyRedirectUri?: boolean;
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
