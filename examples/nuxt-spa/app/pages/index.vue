<script setup lang="ts">
const { isAuthenticated, idToken } = useAuth();

const greeting = computed(() => {
    if (!isAuthenticated.value) {
        return "Browsing as a guest";
    }

    return `Signed in as ${idToken.value?.name ?? "user"}`;
});

const cards = [
    {
        title: "Sign in",
        body: "Header actions reflect your auth state and show the decoded ID token picture claim."
    },
    {
        title: "Visit /protected",
        body: "Try the protected link; unauthenticated sessions are redirected to log in."
    },
    {
        title: "Auto logout",
        body: "Inactivity-triggered logouts display a gentle overlay warning first."
    },
    {
        title: "Switch provider",
        body: "Point .env.local at Auth0, Entra ID, Google OAuth or Keycloak (default)."
    },
    {
        title: "Debug log",
        body: "Pop open devtools to see extra auth state logs from oidc-spa."
    },
    {
        title: "Nuxt UI",
        body: "The Nuxt showcase now uses Nuxt UI cards, alerts, badges, and actions end-to-end."
    }
];
</script>

<template>
    <section class="space-y-8">
        <UCard variant="subtle">
            <template #header>
                <div
                    class="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between"
                >
                    <div>
                        <p class="text-xs uppercase tracking-wide text-muted">Quick start</p>
                        <h1 class="text-2xl font-semibold">A Nuxt-native place to try oidc-spa</h1>
                    </div>
                    <UBadge
                        :color="isAuthenticated ? 'success' : 'neutral'"
                        variant="soft"
                        size="lg"
                        class="max-w-full whitespace-normal"
                    >
                        {{ greeting }}
                    </UBadge>
                </div>
            </template>

            <p class="text-sm text-toned">
                Use the header actions to authenticate, then open protected routes to explore token data,
                Keycloak account actions, and authenticated API calls.
            </p>

            <template #footer>
                <UAlert
                    icon="i-lucide-info"
                    color="primary"
                    variant="soft"
                    title="Tip"
                    description="Use mock mode in .env.local for fast local testing without a live identity provider."
                />
            </template>
        </UCard>

        <div class="grid gap-4 sm:grid-cols-2">
            <UCard v-for="card in cards" :key="card.title" variant="outline">
                <h2 class="text-sm font-semibold">{{ card.title }}</h2>
                <p class="mt-1 text-sm text-toned">{{ card.body }}</p>
            </UCard>
        </div>
    </section>
</template>
