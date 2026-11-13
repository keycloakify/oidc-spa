<script setup lang="ts">
import { computed } from "vue";
import { useRoute } from "vue-router";

const route = useRoute();
const returnToUrl = computed(() => {
    const value = route.query.return_url;
    const homeUrl = new URL(import.meta.env.BASE_URL, window.location.origin).href;
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
