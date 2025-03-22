import { handleOidcCallback } from "oidc-spa/handleOidcCallback";

const { isHandled } = handleOidcCallback();

if (!isHandled) {
    import("./main.lazy");
}
