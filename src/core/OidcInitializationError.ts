type ConstructorParamsOfOidcInitializationError =
    | { messageOrCause: string | Error; isAuthServerLikelyDown: boolean }
    | {
          authResponse: {
              error: string;
              error_description: string | undefined;
          };
      };

export class OidcInitializationError extends Error {
    public readonly isAuthServerLikelyDown: boolean;
    public readonly authResponse:
        | {
              error: string;
              error_description: string | undefined;
          }
        | undefined;

    constructor(params: ConstructorParamsOfOidcInitializationError) {
        super(
            (() => {
                if ("authResponse" in params) {
                    return params.authResponse.error_description ?? params.authResponse.error;
                }

                if (typeof params.messageOrCause === "string") {
                    return params.messageOrCause;
                } else {
                    return `Unknown initialization error: ${params.messageOrCause.message}`;
                }
            })(),
            // @ts-expect-error
            {
                cause: (() => {
                    const cause: Error | undefined = (() => {
                        if ("authResponse" in params) {
                            return undefined;
                        }

                        if (typeof params.messageOrCause === "string") {
                            return undefined;
                        }

                        return params.messageOrCause;
                    })();

                    return cause;
                })()
            }
        );
        this.isAuthServerLikelyDown = "authResponse" in params ? false : params.isAuthServerLikelyDown;
        this.authResponse = !("authResponse" in params) ? undefined : params.authResponse;

        Object.setPrototypeOf(this, new.target.prototype);
    }

    public toString(): string {
        return [
            `oidc-spa Initialization Error: `,
            `isAuthServerLikelyDown: ${this.isAuthServerLikelyDown}`,
            ...(this.authResponse === undefined
                ? []
                : [`Authorization Flow \`error\` response: ${this.authResponse.error}`]),
            ``,
            this.message
        ].join("\n");
    }
}
