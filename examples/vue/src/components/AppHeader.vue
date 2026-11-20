<script setup lang="ts">
import { RouterLink } from "vue-router";
import { useOidc } from "../oidc";
import AuthButtonsLoggedIn from "./AuthButtonsLoggedIn.vue";
import AuthButtonsNotLoggedIn from "./AuthButtonsNotLoggedIn.vue";

const { isOidcReady, isUserLoggedIn, user } = useOidc();
</script>

<template>
    <header class="app-header">
        <div class="header-inner">
            <RouterLink to="/" class="brand">My App</RouterLink>
            <nav aria-label="Main navigation">
                <RouterLink to="/">Home</RouterLink>
                <RouterLink to="/todo-list-trpc">Todos · tRPC</RouterLink>
                <RouterLink to="/todo-list-api">Todos · API</RouterLink>
                <RouterLink v-if="isUserLoggedIn && user?.canSeeAdminNavigation" to="/todo-list-admin">
                    Admin
                </RouterLink>
            </nav>
            <div class="actions">
                <span v-if="!isOidcReady" class="muted">Loading...</span>
                <AuthButtonsLoggedIn v-else-if="isUserLoggedIn" />
                <AuthButtonsNotLoggedIn v-else />
            </div>
        </div>
    </header>
</template>
