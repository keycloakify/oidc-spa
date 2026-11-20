<script setup lang="ts">
import type { UseOidc } from "../../src/vue";

const { useOidc } = defineProps<{
    useOidc: UseOidc<{ name: string }>;
}>();

const oidc = useOidc();

// @ts-expect-error user access requires checking isUserLoggedIn
oidc.value.user.value.name;
</script>

<template>
    <template v-if="oidc.isUserLoggedIn">
        {{ oidc.user.value.name }}
        <!-- @vue-expect-error the user model has no missingProperty field -->
        {{ oidc.user.value.missingProperty }}
    </template>
</template>
