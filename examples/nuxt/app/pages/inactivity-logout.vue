<script setup lang="ts">
import { computed } from "vue";
import { useRoute, useRuntimeConfig } from "#imports";

const route = useRoute();
const {
    app: { baseURL }
} = useRuntimeConfig();
const returnToUrl = computed(() => {
    const value = route.query.return_url;
    const homeUrl = new URL(baseURL, window.location.origin).href;
    if (typeof value !== "string") return homeUrl;
    const url = URL.parse(value, homeUrl);
    return url?.origin === window.location.origin ? url.href : homeUrl;
});
</script>

<template>
    <h1>You have been logged out due to inactivity</h1>
    <p>Sign in again to pick up where you left off.</p>
    <a :href="returnToUrl">Resume to where I was</a>
</template>
