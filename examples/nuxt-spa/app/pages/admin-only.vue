<script setup lang="ts">
// TODO DAN: Roles
definePageMeta({
    middleware: "auth"
});

const REQUIRED_ROLE = "realm-admin";

const { idToken, keycloakUtils } = useAuth();

const hasRequiredRole = computed(() => {
    return !!idToken.value?.realm_access?.roles.includes(REQUIRED_ROLE);
});
</script>

<template>
    <section v-if="!hasRequiredRole">
        <UAlert
            color="error"
            variant="soft"
            icon="i-lucide-shield-x"
            title="Access denied"
            :description="`You need the ${REQUIRED_ROLE} role to view this page.`"
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
                :description="`Access is granted because your ID token includes the ${REQUIRED_ROLE} role.`"
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
