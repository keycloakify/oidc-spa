import { handleOidcCallback } from "./core/handleOidcCallback";

export function oidcEarlyInit() {
    const { isHandled } = handleOidcCallback();

    const shouldLoadApp = !isHandled;

    return { shouldLoadApp };
}
