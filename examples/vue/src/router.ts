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
            meta: { requiresAuth: true },
            children: [
                {
                    path: "todo-list-trpc",
                    component: () => import("./pages/authenticated/TodoListTrpc.vue")
                },
                {
                    path: "todo-list-api",
                    component: () => import("./pages/authenticated/TodoListApi.vue")
                },
                {
                    path: "todo-list-admin",
                    component: () => import("./pages/authenticated/TodoListAdmin.vue")
                },
                { path: "account", component: () => import("./pages/authenticated/Account.vue") }
            ]
        },
        {
            path: "/authentication-error",
            name: "authentication-error",
            component: () => import("./pages/AuthenticationError.vue")
        },
        { path: "/inactivity-logout", component: () => import("./pages/InactivityLogout.vue") },
        { path: "/:pathMatch(.*)*", component: () => import("./pages/NotFound.vue") }
    ],
    scrollBehavior: (_to, _from, savedPosition) => savedPosition ?? { top: 0 }
});

router.beforeEach(async to => {
    if (to.meta.requiresAuth) {
        try {
            await enforceLogin(to);
        } catch {
            return { name: "authentication-error" };
        }
    }
});
