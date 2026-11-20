import { getOidc } from "../oidc";

export function useAuthenticatedFetch() {
    const {
        app: { baseURL }
    } = useRuntimeConfig();

    return $fetch.create({
        baseURL,
        async onRequest({ options }) {
            const oidc = await getOidc();
            if (oidc.isUserLoggedIn) {
                options.headers.set("Authorization", `Bearer ${await oidc.getAccessToken()}`);
            }
        }
    });
}
