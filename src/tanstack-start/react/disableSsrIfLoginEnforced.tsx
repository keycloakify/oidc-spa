import type { createFileRoute } from "@tanstack/react-router";

type OptionsOfCreateFileRoute = NonNullable<Parameters<ReturnType<typeof createFileRoute>>[0]>;

export const BEFORE_LOAD_FN_BRAND_PROPERTY_NAME = "__isOidcSpaEnforceLogin";

export function __disableSsrIfLoginEnforced<Options extends OptionsOfCreateFileRoute>(
    options: Options
): Options {
    if (options.ssr === false) {
        return options;
    }

    const { beforeLoad } = options;

    if (beforeLoad === undefined) {
        return options;
    }

    // @ts-expect-error
    if (!beforeLoad[BEFORE_LOAD_FN_BRAND_PROPERTY_NAME]) {
        return options;
    }

    return {
        ...options,
        ssr: false
    };
}
