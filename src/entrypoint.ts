import { handleOidcCallback } from "./core/handleOidcCallback";

export function oidcEarlyInit(params: { freezeFetch: boolean; freezeXMLHttpRequest: boolean }) {
    const { freezeFetch, freezeXMLHttpRequest } = params ?? {};

    const { isHandled } = handleOidcCallback();

    const shouldLoadApp = !isHandled;

    if (shouldLoadApp) {
        if (freezeXMLHttpRequest) {
            const XMLHttpRequest_trusted = globalThis.XMLHttpRequest;

            Object.freeze(XMLHttpRequest_trusted.prototype);
            Object.freeze(XMLHttpRequest_trusted);

            Object.defineProperty(globalThis, "XMLHttpRequest", {
                configurable: false,
                writable: false,
                enumerable: true,
                value: XMLHttpRequest_trusted
            });
        }

        if (freezeFetch) {
            const fetch_trusted = globalThis.fetch;

            Object.freeze(fetch_trusted.prototype);
            Object.freeze(fetch_trusted);

            Object.defineProperty(globalThis, "fetch", {
                configurable: false,
                writable: false,
                enumerable: true,
                value: fetch_trusted
            });
        }
    }

    return { shouldLoadApp };
}
