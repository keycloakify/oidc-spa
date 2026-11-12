<script setup lang="ts">
import { computed } from "vue";
import { RouterLink } from "vue-router";
import { createKeycloakUtils, isKeycloak } from "oidc-spa/keycloak";
import { useOidc } from "../oidc";

const { oidc, user } = useOidc();
const homeUrl = import.meta.env.BASE_URL;
const keycloakUtils = computed(() => {
    if (!oidc.value || !isKeycloak({ issuerUri: oidc.value.issuerUri })) {
        return undefined;
    }
    return createKeycloakUtils({ issuerUri: oidc.value.issuerUri });
});
</script>

<template>
    <header class="app-header">
        <div class="header-inner">
            <RouterLink to="/" class="brand">My App</RouterLink>
            <nav aria-label="Main navigation">
                <RouterLink to="/">Home</RouterLink>
                <RouterLink to="/todo-list-trpc">Todos · tRPC</RouterLink>
                <RouterLink to="/todo-list-api">Todos · API</RouterLink>
                <RouterLink
                    v-if="oidc?.isUserLoggedIn && user?.canSeeAdminNavigation"
                    to="/todo-list-admin"
                >
                    Admin
                </RouterLink>
            </nav>
            <div class="actions">
                <template v-if="oidc?.isUserLoggedIn">
                    <RouterLink v-if="user" to="/account" class="avatar" aria-label="Open your account">
                        <img
                            :src="user.avatarImgUrl"
                            :alt="`${user.displayName}'s avatar`"
                            width="32"
                            height="32"
                        />
                    </RouterLink>
                    <button type="button" @click="oidc.logout({ returnToUrl: homeUrl })">Logout</button>
                </template>
                <template v-else-if="oidc">
                    <button
                        type="button"
                        class="button-primary"
                        @click="oidc.login({ doesCurrentHrefEnforceLogin: false })"
                    >
                        Login
                    </button>
                    <button
                        v-if="keycloakUtils"
                        type="button"
                        @click="
                            oidc.login({
                                doesCurrentHrefEnforceLogin: false,
                                transformAuthorizationUrl:
                                    keycloakUtils.transformAuthorizationUrl_register
                            })
                        "
                    >
                        Register
                    </button>
                </template>
            </div>
        </div>
    </header>
</template>
