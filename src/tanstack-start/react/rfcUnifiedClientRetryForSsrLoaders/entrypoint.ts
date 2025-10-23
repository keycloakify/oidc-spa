import { ERROR_MESSAGE_SINGULAR_STRING } from "./UnifiedClientRetryForSsrLoadersError";

export function preventConsoleLoggingOfUnifiedClientRetryForSsrLoadersError() {
    const originalConsoleError = console.error;

    console.error = function error(...args) {
        if (args[1] instanceof Error && args[1].message.includes(ERROR_MESSAGE_SINGULAR_STRING)) {
            return;
        }

        originalConsoleError.call(console, ...args);
    };
}
