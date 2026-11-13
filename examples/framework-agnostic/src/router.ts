import { createRouter, createWebHistory } from "vue-router";
import { enforceLogin } from "./oidc";

declare module "vue-router" {
    interface RouteMeta {
        requiresAuth?: boolean;
    }
}

export const router = createRouter({
    history: createWebHistory(import.meta.env.BASE_URL),
    routes: [
        { path: "/", component: () => import("./pages/Home.vue") },
        {
            path: "/",
            component: () => import("./components/AuthenticatedLayout.vue"),
            meta: { requiresAuth: true },
            children: [
                { path: "todo-list-trpc", component: () => import("./pages/TodoListTrpc.vue") },
                { path: "todo-list-api", component: () => import("./pages/TodoListApi.vue") },
                { path: "todo-list-admin", component: () => import("./pages/TodoListAdmin.vue") },
                { path: "account", component: () => import("./pages/Account.vue") }
            ]
        },
        { path: "/inactivity-logout", component: () => import("./pages/InactivityLogout.vue") },
        { path: "/:pathMatch(.*)*", component: () => import("./pages/NotFound.vue") }
    ],
    scrollBehavior: (_to, _from, savedPosition) => savedPosition ?? { top: 0 }
});

router.beforeEach(async to => {
    if (to.meta.requiresAuth) {
        await enforceLogin(router.resolve(to).href);
    }
});
