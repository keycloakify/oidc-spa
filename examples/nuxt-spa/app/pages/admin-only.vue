<script setup lang="ts">
definePageMeta({ middleware: "auth" });

const { user, keycloakUtils } = useAuth();
</script>

<template>
    <section v-if="!user?.canSeeKeycloakAdminNavigation">
        <UAlert
            color="error"
            variant="soft"
            icon="i-lucide-shield-x"
            title="Access denied"
            description="You are signed in, but your account does not have access to the administration page."
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
                description="Your account has access to the Keycloak administration console."
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
