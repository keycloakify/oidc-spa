export const ERROR_MESSAGE_SINGULAR_STRING = "__RETRY_ON_CLIENT_SENTINEL__";

export class UnifiedClientRetryForSsrLoadersError extends Error {
    constructor(message: string) {
        super(`(${ERROR_MESSAGE_SINGULAR_STRING}) ${message}`);
        Object.setPrototypeOf(this, new.target.prototype);
    }
}
