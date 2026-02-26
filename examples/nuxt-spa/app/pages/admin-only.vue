<script setup lang="ts">
definePageMeta({
    middleware: "auth",
    requiredRoles: ["realm-admin"]
});

const { routeRoleAccess, keycloakUtils } = useAuth();

const hasRequiredRole = computed(() => routeRoleAccess.value.hasRequiredRoles);

const requiredRolesText = computed(() => {
    return routeRoleAccess.value.requiredRoles.join(", ");
});

const missingRolesText = computed(() => {
    return routeRoleAccess.value.missingRoles.join(", ");
});
</script>

<template>
    <section v-if="!hasRequiredRole">
        <UAlert
            color="error"
            variant="soft"
            icon="i-lucide-shield-x"
            title="Access denied"
            :description="`You are authenticated but missing required role(s): ${missingRolesText}. Required: ${requiredRolesText}.`"
        />
    </section>

    <section v-else class="space-y-6">
        <UCard variant="subtle">
            <template #header>
                <h1 class="text-xl font-semibold">Administration Page</h1>
            </template>

            <UAlert
                color="success"
                variant="soft"
                icon="i-lucide-shield-check"
                :description="`Access is granted because your ID token includes all required role(s): ${requiredRolesText}.`"
            />

            <template #footer>
                <UButton
                    v-if="keycloakUtils"
                    color="neutral"
                    variant="outline"
                    icon="i-lucide-square-arrow-out-up-right"
                    :to="keycloakUtils.adminConsoleUrl"
                    target="_blank"
                >
                    Open the Keycloak administration console
                </UButton>
            </template>
        </UCard>
    </section>
</template>
