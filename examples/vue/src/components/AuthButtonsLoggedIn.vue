<script setup lang="ts">
import { RouterLink } from "vue-router";
import { useOidc } from "../oidc";

const { user, logout } = useOidc({ assert: "user logged in" });
</script>

<template>
    <RouterLink to="/account" class="avatar" aria-label="Open your account">
        <img :src="user.avatarImgUrl" :alt="`${user.displayName}'s avatar`" width="32" height="32" />
    </RouterLink>
    <button type="button" @click="logout()">Logout</button>
</template>
