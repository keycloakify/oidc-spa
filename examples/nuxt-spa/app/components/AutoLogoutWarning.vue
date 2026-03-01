<script setup lang="ts">
const { autoLogoutState } = useAuth();

const isOpen = computed(() => autoLogoutState.value.shouldDisplayWarning);

const secondsLeft = computed(() => {
    if (!autoLogoutState.value.shouldDisplayWarning) {
        return 0;
    }

    return autoLogoutState.value.secondsLeftBeforeAutoLogout;
});
</script>

<template>
    <UModal :open="isOpen" :close="false" :dismissible="false" :overlay="true">
        <template #body>
            <UAlert
                color="warning"
                variant="soft"
                icon="i-lucide-timer-reset"
                title="Are you still there?"
                :description="`You will be logged out in ${secondsLeft}s`"
            />
        </template>
    </UModal>
</template>
