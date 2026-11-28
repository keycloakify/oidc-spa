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
