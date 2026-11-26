<script setup lang="ts">
import { useOidc } from "../../oidc";
import AuthButtonsLoggedIn from "./AuthButtonsLoggedIn.vue";
import AuthButtonsNotLoggedIn from "./AuthButtonsNotLoggedIn.vue";

const oidc = useOidc();
</script>

<template>
    <header class="app-header">
        <div class="header-inner">
            <NuxtLink to="/" class="brand">My App</NuxtLink>
            <nav aria-label="Main navigation">
                <NuxtLink to="/">Home</NuxtLink>
                <NuxtLink to="/todo-list">Todos</NuxtLink>
                <NuxtLink
                    v-if="oidc.isUserLoggedIn && oidc.user.value.canSeeAdminNavigation"
                    to="/todo-list-admin"
                >
                    Admin
                </NuxtLink>
            </nav>
            <div v-if="oidc.isOidcReady" class="actions">
                <AuthButtonsLoggedIn v-if="oidc.isUserLoggedIn" />
                <AuthButtonsNotLoggedIn v-else />
            </div>
        </div>
    </header>
</template>
