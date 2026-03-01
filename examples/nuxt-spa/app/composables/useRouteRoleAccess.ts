export type RouteRoleAccess = {
    requiredRoles: string[];
    missingRoles: string[];
    hasRequiredRoles: boolean;
};

export function useRouteRoleAccessState() {
    return useState<RouteRoleAccess>("route-role-access", () => ({
        requiredRoles: [],
        missingRoles: [],
        hasRequiredRoles: true
    }));
}
