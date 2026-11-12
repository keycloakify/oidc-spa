<script setup lang="ts">
import { useOidc } from "../oidc";

const { autoLogoutState } = useOidc();
</script>

<template>
    <div
        v-if="autoLogoutState.shouldDisplayWarning"
        class="session-overlay"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="session-warning-title"
        aria-describedby="session-warning-description"
    >
        <div>
            <h2 id="session-warning-title">Are you still there?</h2>
            <p id="session-warning-description">
                You will be logged out in {{ autoLogoutState.secondsLeftBeforeAutoLogout }} seconds.
            </p>
            <button type="button" @click="autoLogoutState.resetAutoLogoutCountdown()">
                Stay signed in
            </button>
        </div>
    </div>
</template>
