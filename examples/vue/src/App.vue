<script setup lang="ts">
import { RouterView } from "vue-router";
import AppHeader from "./components/AppHeader.vue";
import AutoLogoutWarningOverlay from "./components/AutoLogoutWarningOverlay.vue";
</script>

<template>
    <AppHeader />
    <main>
        <RouterView />
    </main>
    <AutoLogoutWarningOverlay />
</template>
