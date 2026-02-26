<script setup lang="ts">
definePageMeta({
    middleware: "auth"
});

type DemoPost = {
    id: number;
    title: string;
    body: string;
};

const {
    idToken,
    keycloakUtils,
    clientId,
    validRedirectUri,
    goToAuthServer,
    backFromAuthServer,
    fetchWithAuth
} = useAuth();

const {
    data: demoPosts,
    pending: isLoadingDemoPosts,
    error: demoPostsError
} = await useLazyAsyncData("demo-posts", () =>
    fetchWithAuth<DemoPost[]>("https://jsonplaceholder.typicode.com/posts?_limit=4")
);
</script>

<template>
    <section class="space-y-6">
        <UCard variant="subtle">
            <template #header>
                <div
                    class="flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between"
                >
                    <div>
                        <p class="text-xs uppercase tracking-wide text-muted">Protected content</p>
                        <h1 class="text-2xl font-semibold">Hello {{ idToken?.name ?? "user" }}</h1>
                    </div>
                    <UBadge color="primary" variant="soft">Authenticated</UBadge>
                </div>
            </template>

            <p class="text-sm text-toned">
                These actions come directly from your identity provider via oidc-spa.
            </p>

            <dl class="mt-4 grid gap-2 text-sm">
                <div class="flex flex-wrap justify-between gap-2">
                    <dt class="text-muted">Subject</dt>
                    <dd class="font-medium">{{ idToken?.sub }}</dd>
                </div>
                <div v-if="idToken?.email" class="flex flex-wrap justify-between gap-2">
                    <dt class="text-muted">Email</dt>
                    <dd class="font-medium">{{ idToken.email }}</dd>
                </div>
                <div v-if="idToken?.preferred_username" class="flex flex-wrap justify-between gap-2">
                    <dt class="text-muted">Username</dt>
                    <dd class="font-medium">{{ idToken.preferred_username }}</dd>
                </div>
            </dl>

            <template #footer>
                <div class="space-y-3">
                    <div v-if="keycloakUtils" class="flex flex-wrap gap-2">
                        <UButton
                            class="w-full sm:w-auto"
                            color="neutral"
                            variant="soft"
                            icon="i-lucide-key-round"
                            @click="
                                goToAuthServer({ extraQueryParams: { kc_action: 'UPDATE_PASSWORD' } })
                            "
                        >
                            Change password
                        </UButton>
                        <UButton
                            class="w-full sm:w-auto"
                            color="neutral"
                            variant="soft"
                            icon="i-lucide-user-round-cog"
                            @click="
                                goToAuthServer({ extraQueryParams: { kc_action: 'UPDATE_PROFILE' } })
                            "
                        >
                            Update profile
                        </UButton>
                        <UButton
                            class="w-full sm:w-auto"
                            color="error"
                            variant="soft"
                            icon="i-lucide-user-round-x"
                            @click="
                                goToAuthServer({ extraQueryParams: { kc_action: 'delete_account' } })
                            "
                        >
                            Delete account
                        </UButton>
                        <UButton
                            class="w-full sm:w-auto"
                            color="neutral"
                            variant="outline"
                            icon="i-lucide-square-arrow-out-up-right"
                            :to="
                                keycloakUtils.getAccountUrl({
                                    clientId,
                                    validRedirectUri,
                                    locale: undefined
                                })
                            "
                            target="_blank"
                        >
                            My Account
                        </UButton>
                    </div>

                    <UAlert
                        v-if="backFromAuthServer?.extraQueryParams.kc_action"
                        color="primary"
                        variant="soft"
                        icon="i-lucide-arrow-left-right"
                        :title="`Result for ${backFromAuthServer.extraQueryParams.kc_action}`"
                        :description="backFromAuthServer.result.kc_action_status"
                    />
                </div>
            </template>
        </UCard>

        <UCard variant="outline">
            <template #header>
                <h2 class="text-lg font-semibold">Authenticated API example</h2>
            </template>

            <UAlert
                color="neutral"
                variant="subtle"
                icon="i-lucide-info"
                title="fetchWithAuth"
                description="Requests include Authorization: Bearer <access_token> when logged in."
            />

            <div v-if="isLoadingDemoPosts" class="mt-4 space-y-3">
                <UCard v-for="n in 4" :key="n" variant="soft">
                    <USkeleton class="h-4 w-2/3" />
                    <USkeleton class="mt-2 h-4 w-full" />
                    <USkeleton class="mt-2 h-4 w-5/6" />
                </UCard>
            </div>

            <UAlert
                v-else-if="demoPostsError"
                class="mt-4"
                color="error"
                variant="soft"
                icon="i-lucide-triangle-alert"
                title="Unable to load example posts"
                :description="demoPostsError.message"
            />

            <div v-else class="mt-4 space-y-3">
                <UCard v-for="post in demoPosts" :key="post.id" variant="soft">
                    <h3 class="text-sm font-semibold">{{ post.title }}</h3>
                    <p class="mt-1 text-sm text-toned">{{ post.body }}</p>
                </UCard>
            </div>
        </UCard>
    </section>
</template>
