export class OidcAccessedTooEarlyError extends Error {
    constructor(message: string) {
        super(message);
        Object.setPrototypeOf(this, new.target.prototype);
    }
}

/** Only this error permits an interceptor callback to be retried after core initialization. */
export class CoreAccessedTooEarlyError extends OidcAccessedTooEarlyError {}
