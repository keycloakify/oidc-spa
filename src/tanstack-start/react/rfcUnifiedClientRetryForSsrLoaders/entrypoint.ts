import { ERROR_MESSAGE_SINGULAR_STRING } from "./UnifiedClientRetryForSsrLoadersError";

export function preventConsoleLoggingOfUnifiedClientRetryForSsrLoadersError() {
    const originalConsoleError = console.error;

    console.error = function error(...args) {
        for (const arg of args) {
            if (arg instanceof Error && arg.message.includes(ERROR_MESSAGE_SINGULAR_STRING)) {
                return;
            }
        }

        originalConsoleError.call(console, ...args);
    };
}
