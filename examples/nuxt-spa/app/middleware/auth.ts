function getRequiredRoles(meta: { requiredRole?: string; requiredRoles?: string[] }) {
    const roles = new Set<string>();

    if (typeof meta.requiredRole === "string" && meta.requiredRole.length > 0) {
        roles.add(meta.requiredRole);
    }

    for (const role of meta.requiredRoles ?? []) {
        if (typeof role === "string" && role.length > 0) {
            roles.add(role);
        }
    }

    return Array.from(roles);
}

export default defineNuxtRouteMiddleware(async to => {
    const { $oidc } = useNuxtApp();
    const routeRoleAccessState = useRouteRoleAccessState();
    const requiredRoles = getRequiredRoles(to.meta);

    if ($oidc.isUserLoggedIn) {
        if (requiredRoles.length === 0) {
            routeRoleAccessState.value = {
                requiredRoles: [],
                missingRoles: [],
                hasRequiredRoles: true
            };
            return;
        }

        const userRoles = $oidc.getDecodedIdToken().realm_access?.roles ?? [];
        const missingRoles = requiredRoles.filter(role => !userRoles.includes(role));

        routeRoleAccessState.value = {
            requiredRoles,
            missingRoles,
            hasRequiredRoles: missingRoles.length === 0
        };

        return;
    }

    routeRoleAccessState.value = {
        requiredRoles: [],
        missingRoles: [],
        hasRequiredRoles: true
    };

    await $oidc.login({
        doesCurrentHrefRequiresAuth: true,
        redirectUrl: to.fullPath
    });

    return abortNavigation();
});
