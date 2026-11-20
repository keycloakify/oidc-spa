import { enforceLogin } from "../oidc";

export default defineNuxtRouteMiddleware(async to => {
    // Login is enforced in the browser.
    if (import.meta.server) {
        return;
    }

    if (!to.meta.requiresAuth) {
        return;
    }

    try {
        await enforceLogin(to);
    } catch {
        return navigateTo("/authentication-error");
    }
});
