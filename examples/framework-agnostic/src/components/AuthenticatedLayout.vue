<script setup lang="ts">
import { RouterView } from "vue-router";
import AutoLogoutWarningOverlay from "./AutoLogoutWarningOverlay.vue";
</script>

<template>
    <RouterView />
    <AutoLogoutWarningOverlay />
</template>
