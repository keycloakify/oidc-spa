<script setup lang="ts">
import { RouterLink } from "vue-router";
import { createKeycloakUtils, isKeycloak } from "oidc-spa/keycloak-utils";
import { getOidcSync, useUser } from "../oidc";

const oidc = getOidcSync();
const user = useUser();
const homeUrl = import.meta.env.BASE_URL;
const keycloakUtils = isKeycloak({ issuerUri: oidc.issuerUri })
    ? createKeycloakUtils({ issuerUri: oidc.issuerUri })
    : undefined;
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
                    v-if="oidc.isUserLoggedIn && user.canSeeAdminNavigation"
                    to="/todo-list-admin"
                >
                    Admin
                </RouterLink>
            </nav>
            <div class="actions">
                <template v-if="oidc.isUserLoggedIn">
                    <RouterLink to="/account" class="avatar" aria-label="Open your account">
                        <img
                            :src="user.avatarImgUrl"
                            :alt="`${user.displayName}'s avatar`"
                            width="32"
                            height="32"
                        />
                    </RouterLink>
                    <button type="button" @click="oidc.logout({ returnToUrl: homeUrl })">Logout</button>
                </template>
                <template v-else>
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
