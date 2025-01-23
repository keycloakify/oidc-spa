import { assert, type Equals } from "../vendor/frontend/tsafe";

export class OidcInitializationError extends Error {
    public readonly type: "server down" | "bad configuration" | "unknown";

    constructor(
        params:
            | {
                  type: "server down";
                  issuerUri: string;
              }
            | {
                  type: "bad configuration";
                  likelyCause:
                      | {
                            // Most likely redirect URIs or the client does not exist.
                            type: "misconfigured OIDC client";
                            clientId: string;
                            timeoutDelayMs: number;
                            callbackUrl: string;
                        }
                      | {
                            type: "not in Web Origins";
                            clientId: string;
                        }
                      | {
                            type: "oidc-callback.htm not properly served";
                            oidcCallbackHtmUrl: string;
                            likelyCause:
                                | "serving another file"
                                | "the file hasn't been created"
                                | "using .html instead of .htm extension";
                        }
                      | {
                            type: "frame-ancestors none";
                            urls: {
                                hasDedicatedHtmFile: boolean;
                                callbackUrl: string;
                            };
                        };
              }
            | {
                  type: "unknown";
                  cause: Error;
              }
    ) {
        super(
            (() => {
                switch (params.type) {
                    case "server down":
                        return [
                            `The OIDC server seems to be down.`,
                            `If you know it's not the case it means that the issuerUri: ${params.issuerUri} is incorrect.`,
                            `If you are using Keycloak makes sure that the realm exists and that the url is well formed.\n`,
                            `More info: https://docs.oidc-spa.dev/v/v5/resources/usage-with-keycloak`
                        ].join(" ");
                    case "bad configuration":
                        switch (params.likelyCause.type) {
                            case "misconfigured OIDC client":
                                return [
                                    `The OIDC client ${params.likelyCause.clientId} seems to be misconfigured on your OIDC server.`,
                                    `If you are using Keycloak you likely need to add "${params.likelyCause.callbackUrl}" to the list of Valid Redirect URIs`,
                                    `in the ${params.likelyCause.clientId} client configuration.\n`,
                                    `More info: https://docs.oidc-spa.dev/v/v5/resources/usage-with-keycloak`,
                                    `Silent SSO timed out after ${params.likelyCause.timeoutDelayMs}ms.`
                                ].join(" ");
                            case "not in Web Origins":
                                return [
                                    `It seems that there is a CORS issue.`,
                                    `If you are using Keycloak check the "Web Origins" option in your ${params.likelyCause.clientId} client configuration.`,
                                    `You should probably add "${location.origin}/*" to the list.`,
                                    `More info: https://docs.oidc-spa.dev/v/v5/resources/usage-with-keycloak`
                                ].join(" ");
                            case "oidc-callback.htm not properly served":
                                return [
                                    `${params.likelyCause.oidcCallbackHtmUrl} not properly served by your web server.`,
                                    (() => {
                                        switch (params.likelyCause.likelyCause) {
                                            case "the file hasn't been created":
                                                return "You probably forgot to create the silent-sso.htm file in the public directory.";
                                            case "serving another file":
                                                return [
                                                    "You probably forgot to create the `silent-sso.htm` file in the public directory.",
                                                    "If you did create it check the configuration of your web server, it's probably re-routing the GET request to silent-sso.htm",
                                                    "to another file. Likely your index.html"
                                                ].join(" ");
                                            case "using .html instead of .htm extension":
                                                return "You have probably upgraded from oidc-spa v4 to v5, in oidc-spa v5 the silent-sso file should have a .htm extension instead of .html";
                                        }
                                    })(),
                                    `Documentation: https://docs.oidc-spa.dev/v/v5/documentation/installation`
                                ].join(" ");
                            case "frame-ancestors none":
                                return [
                                    params.likelyCause.urls.hasDedicatedHtmFile
                                        ? `The oidc-callback.htm file, `
                                        : `The URI used for Silent SSO, `,
                                    `${params.likelyCause.urls.callbackUrl}, `,
                                    "is served by your web server with the HTTP header `Content-Security-Policy: frame-ancestors none` in the response.\n",
                                    "This header prevents the silent sign-in process from working.\n",
                                    "To fix this issue, you should configure your web server to not send this header or to use `frame-ancestors self` instead of `frame-ancestors none`.\n",
                                    "If you use Nginx, you can replace:\n",
                                    `add_header Content-Security-Policy "frame-ancestors 'none'";\n`,
                                    "with:\n",
                                    `map $uri $add_content_security_policy {\n`,
                                    `   "~*silent-sso\.html$" "frame-ancestors 'self'";\n`,
                                    `   default "frame-ancestors 'none'";\n`,
                                    `}\n`,
                                    `add_header Content-Security-Policy $add_content_security_policy;\n`
                                ].join(" ");
                        }
                    case "unknown":
                        return params.cause.message;
                }
                assert<Equals<typeof params, never>>(false);
            })(),
            // @ts-expect-error
            { "cause": params.type === "unknown" ? params.cause : undefined }
        );
        this.type = params.type;
        Object.setPrototypeOf(this, new.target.prototype);
    }
}
