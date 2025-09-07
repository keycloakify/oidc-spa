export class OidcInitializationError extends Error {
    public readonly isAuthServerLikelyDown: boolean;

    constructor(params: { messageOrCause: string | Error; isAuthServerLikelyDown: boolean }) {
        super(
            (() => {
                if (typeof params.messageOrCause === "string") {
                    return params.messageOrCause;
                } else {
                    return `Unknown initialization error: ${params.messageOrCause.message}`;
                }
            })(),
            // @ts-expect-error
            { cause: typeof params.messageOrCause === "string" ? undefined : params.messageOrCause }
        );
        this.isAuthServerLikelyDown = params.isAuthServerLikelyDown;
        Object.setPrototypeOf(this, new.target.prototype);
    }
}
