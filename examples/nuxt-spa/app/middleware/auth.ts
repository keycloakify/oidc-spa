export default defineNuxtRouteMiddleware(async to => {
    const { $oidc } = useNuxtApp();

    if ($oidc.isUserLoggedIn) {
        return;
    }

    await $oidc.login({
        doesCurrentHrefRequiresAuth: true,
        redirectUrl: to.fullPath
    });

    return abortNavigation();
});

// TODO DAN: Roles check here
