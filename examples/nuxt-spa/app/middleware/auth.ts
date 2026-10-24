export default defineNuxtRouteMiddleware(async to => {
    const { $oidc } = useNuxtApp();

    if ($oidc.isUserLoggedIn) {
        return;
    }

    await $oidc.login({ redirectUrl: to.fullPath });

    return abortNavigation();
});
