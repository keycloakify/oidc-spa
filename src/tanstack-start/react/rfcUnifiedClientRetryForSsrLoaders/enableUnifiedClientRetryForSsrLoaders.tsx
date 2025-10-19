import { useEffect } from "react";
import { type createFileRoute, useRouter } from "@tanstack/react-router";
import { ERROR_MESSAGE_SINGULAR_STRING } from "./UnifiedClientRetryForSsrLoadersError";

type OptionsOfCreateFileRoute = NonNullable<Parameters<ReturnType<typeof createFileRoute>>[0]>;

export function enableUnifiedClientRetryForSsrLoaders<Options extends OptionsOfCreateFileRoute>(
    options: Options
): Options {
    function ErrorComponentWithUnifiedClientRetryForSsrLoader(
        props: Parameters<
            Exclude<OptionsOfCreateFileRoute["errorComponent"], null | false | undefined>
        >[0]
    ) {
        unified_client_retry: {
            const { error } = props;

            const isSentinelError = error.message.includes(ERROR_MESSAGE_SINGULAR_STRING);

            const router = useRouter();

            useEffect(() => {
                if (!isSentinelError) {
                    return;
                }

                router.invalidate();
            }, []);

            if (!isSentinelError) {
                break unified_client_retry;
            }

            const PendingComponent = options.pendingComponent;

            if (PendingComponent === undefined) {
                return null;
            }

            return <PendingComponent />;
        }

        // Default behavior
        {
            const { errorComponent } = options;

            if (errorComponent === false) {
                queueMicrotask(() => {
                    throw props.error;
                });

                return null;
            }

            if (errorComponent === null || errorComponent === undefined) {
                throw props.error;
            }

            const ErrorComponent = errorComponent;

            return <ErrorComponent {...props} />;
        }
    }

    forward_properties: {
        const { errorComponent } = options;

        if (!errorComponent) {
            ErrorComponentWithUnifiedClientRetryForSsrLoader.displayName =
                ErrorComponentWithUnifiedClientRetryForSsrLoader.name;
            break forward_properties;
        }

        const ErrorComponent = errorComponent;

        ErrorComponentWithUnifiedClientRetryForSsrLoader.displayName = `${
            (ErrorComponent as any).displayName ?? ErrorComponent.name ?? "ErrorComponent"
        }WithUnifiedClientRetryForSsrLoader`;

        if (ErrorComponent.preload !== undefined) {
            ErrorComponentWithUnifiedClientRetryForSsrLoader.preload =
                ErrorComponent.preload.bind(ErrorComponent);
        }
    }

    return {
        ...options,
        errorComponent: ErrorComponentWithUnifiedClientRetryForSsrLoader
    };
}
