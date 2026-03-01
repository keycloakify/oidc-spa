import type { Roles } from "~/constants/roles";

declare module "#app" {
    interface PageMeta {
        requiredRole?: Roles;
        requiredRoles?: Roles[];
    }
}

declare module "vue-router" {
    interface RouteMeta {
        requiredRole?: Roles;
        requiredRoles?: Roles[];
    }
}

export {};
