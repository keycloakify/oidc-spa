<script setup lang="ts">
import { useOidc } from "../oidc";

const { initializationError } = useOidc();

function reload() {
    window.location.reload();
}
</script>

<template>
    <article role="alert">
        <h1>Authentication unavailable</h1>
        <p>{{ initializationError?.message }}</p>
        <div class="actions">
            <button type="button" @click="reload">Try again</button>
            <NuxtLink to="/">Return home</NuxtLink>
        </div>
    </article>
</template>
