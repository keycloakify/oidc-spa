<script setup lang="ts">
import type { UseOidc } from "../../src/vue";

const { useOidc } = defineProps<{
    useOidc: UseOidc<{ name: string; canSeeAdminNavigation: boolean }>;
}>();

const oidc = useOidc();
</script>

<template>
    <span v-if="oidc.isUserLoggedIn && oidc.user.value.canSeeAdminNavigation">
        {{ oidc.user.value.name }}
    </span>
</template>
