<template>
    <UApp>
        <div class="min-h-screen bg-default">
            <NuxtRouteAnnouncer />
            <AppHeader />
            <UContainer class="py-8">
                <main class="mx-auto flex w-full max-w-5xl flex-col gap-8 pt-28 pb-12 sm:pt-24">
                    <NuxtPage />
                </main>
            </UContainer>
            <AutoLogoutWarning />
        </div>
    </UApp>
</template>
