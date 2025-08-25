import {
    handleOidcCallback,
    moveRedirectAuthResponseFromSessionStorageToMemory
} from "./core/handleOidcCallback";
import { preventSessionStorageSetItemOfPublicKeyByThirdParty } from "./core/iframeMessageProtection";

export function oidcEarlyInit(params: {
    freezeFetch: boolean;
    freezeXMLHttpRequest: boolean;
    // NOTE: Made optional just to avoid breaking change.
    // Will be made mandatory next major.
    freezeWebSocket?: boolean;
}) {
    const { freezeFetch, freezeXMLHttpRequest, freezeWebSocket = false } = params ?? {};

    const { isHandled } = handleOidcCallback();

    const shouldLoadApp = !isHandled;

    if (shouldLoadApp) {
        moveRedirectAuthResponseFromSessionStorageToMemory();

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

        if (freezeWebSocket) {
            const WebSocket_trusted = globalThis.WebSocket;

            Object.freeze(WebSocket_trusted.prototype);
            Object.freeze(WebSocket_trusted);

            Object.defineProperty(globalThis, "WebSocket", {
                configurable: false,
                writable: false,
                enumerable: true,
                value: WebSocket_trusted
            });
        }

        preventSessionStorageSetItemOfPublicKeyByThirdParty();
    }

    return { shouldLoadApp };
}
