<script setup lang="ts">
import { createKeycloakUtils, isKeycloak } from "oidc-spa/keycloak";

const { isAuthenticated, idToken, issuerUri, login, register, logout } = useAuth();

const keycloakUtils = computed(() => {
    if (!isKeycloak({ issuerUri: issuerUri.value })) {
        return undefined;
    }

    return createKeycloakUtils({ issuerUri: issuerUri.value });
});

const profileImageSrc = computed(() => {
    const picture = idToken.value?.picture;
    return picture && picture.trim().length > 0 ? picture : undefined;
});

const profileName = computed(() => {
    return idToken.value?.name ?? idToken.value?.preferred_username ?? "User";
});

const navigationItems = computed(() => {
    return [
        { label: "Home", to: "/", icon: "i-lucide-house" },
        { label: "Protected", to: "/protected", icon: "i-lucide-lock" },
        { label: "Admin", to: "/admin-only", icon: "i-lucide-shield-check" }
    ];
});

function registerWithProvider() {
    if (!keycloakUtils.value) {
        return;
    }

    register(keycloakUtils.value.transformUrlBeforeRedirectForRegister);
}
</script>

<template>
    <header class="fixed inset-x-0 top-0 z-40 border-b border-default bg-default/90 backdrop-blur">
        <UContainer>
            <div class="flex w-full flex-col gap-2 py-2">
                <div class="flex items-center justify-between gap-2">
                    <div class="flex min-w-0 items-center gap-2">
                        <UIcon name="i-lucide-shield-check" class="size-5 shrink-0 text-primary" />
                        <span class="truncate text-xs font-semibold sm:text-sm">oidc-spa · Nuxt</span>
                        <UBadge class="hidden md:inline-flex" color="neutral" variant="subtle" size="sm">
                            {{ isAuthenticated ? "Signed in" : "Guest" }}
                        </UBadge>
                    </div>

                    <div class="flex min-w-0 items-center justify-end gap-2">
                        <template v-if="!isAuthenticated">
                            <UButton
                                color="primary"
                                variant="solid"
                                icon="i-lucide-log-in"
                                size="sm"
                                @click="login"
                            >
                                Login
                            </UButton>
                            <UButton
                                v-if="keycloakUtils"
                                color="neutral"
                                variant="outline"
                                icon="i-lucide-user-plus"
                                size="sm"
                                class="hidden sm:inline-flex"
                                @click="registerWithProvider"
                            >
                                Register
                            </UButton>
                        </template>

                        <template v-else>
                            <UAvatar
                                :src="profileImageSrc"
                                :alt="`${profileName}'s avatar`"
                                :text="profileName[0]"
                                size="xs"
                            />
                            <UButton
                                color="neutral"
                                variant="soft"
                                icon="i-lucide-log-out"
                                size="sm"
                                @click="logout"
                            >
                                Logout
                            </UButton>
                        </template>
                    </div>
                </div>

                <div class="w-full overflow-x-auto md:overflow-visible">
                    <UNavigationMenu
                        :items="navigationItems"
                        variant="link"
                        color="neutral"
                        highlight
                        highlight-color="primary"
                        class="min-w-max md:mx-auto md:w-fit"
                    />
                </div>
            </div>
        </UContainer>
    </header>
</template>
