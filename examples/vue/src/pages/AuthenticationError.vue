<script setup lang="ts">
import { RouterLink } from "vue-router";
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
            <RouterLink to="/">Return home</RouterLink>
        </div>
    </article>
</template>
