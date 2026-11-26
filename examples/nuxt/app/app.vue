<script setup lang="ts">
import AppHeader from "./components/app-header/AppHeader.vue";
</script>

<template>
    <AppHeader />
    <main>
        <NuxtPage />
    </main>
    <AutoLogoutWarningOverlay />
</template>
