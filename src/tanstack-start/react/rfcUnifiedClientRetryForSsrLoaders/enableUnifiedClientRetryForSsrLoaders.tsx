import { useEffect } from "react";
import { type createFileRoute, useRouter } from "@tanstack/react-router";
import { ERROR_MESSAGE_SINGULAR_STRING } from "./UnifiedClientRetryForSsrLoadersError";
import { inferIsViteDev } from "../../../tools/inferIsViteDev";

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

            const isSentinelError =
                error instanceof Error && error.message.includes(ERROR_MESSAGE_SINGULAR_STRING);

            const router = useRouter();

            useEffect(() => {
                if (!isSentinelError) {
                    return;
                }

                const isDev = inferIsViteDev();

                if (isDev) {
                    console.info(
                        [
                            "oidc-spa: Detected a client-only operation.",
                            "\n(e.g. an enforceLogin() in a beforeLoad, or an authenticated fetch in a loader).",
                            "\nThis action cannot run on the server because, in oidc-spa, the client exclusively owns the authentication state.",
                            "\nTo preserve correctness, oidc-spa gracefully retried the operation on the client.",
                            "\nSSR was automatically skipped on this route component for this request to ensure consistent behavior.\n",
                            "\nNote: TanStack Start does not yet provide an official mechanism for 'retry on client'.",
                            "\noidc-spa implements this behavior transparently via its Vite plugin,",
                            "until a standardized per-request SSR control becomes available.",
                            "\nYou may also see a `Warning: Error in route match:` above, this is expected and can be safely ignored."
                        ].join(" ")
                    );
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
