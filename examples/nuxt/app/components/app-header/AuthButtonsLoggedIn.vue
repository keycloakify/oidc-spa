<script setup lang="ts">
import { useOidc } from "../../oidc";

const { user, logout } = useOidc({ assert: "user logged in" });
</script>

<template>
    <NuxtLink to="/account" class="avatar" aria-label="Open your account">
        <img :src="user.avatarImgUrl" :alt="`${user.displayName}'s avatar`" width="32" height="32" />
    </NuxtLink>
    <button type="button" @click="logout()">Logout</button>
</template>
