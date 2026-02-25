<script setup lang="ts">
const { isAuthenticated, idToken, login, logout } = useAuth()
</script>

<template>
  <div
    class="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950 p-4"
  >
    <UCard class="w-full max-w-2xl">
      <template #header>
        <div class="text-center py-2">
          <h1 class="text-2xl font-bold text-gray-900 dark:text-white">
            Nuxt oidc-spa showcase
          </h1>
          <p class="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Secure authentication demo
          </p>
        </div>
      </template>

      <div class="space-y-6">
        <!-- Authentication Status -->
        <div
          class="flex items-center justify-between p-4 rounded-lg bg-gray-100 dark:bg-gray-800"
        >
          <span class="text-sm font-medium text-gray-700 dark:text-gray-300"
            >Authentication Status</span
          >
          <UBadge
            :color="isAuthenticated ? 'success' : 'error'"
            variant="solid"
            size="lg"
          >
            <UIcon
              :name="`material-symbols:${isAuthenticated ? 'check-circle' : 'error'}`"
              class="size-4 mr-1"
            />
            {{ isAuthenticated ? 'Logged In' : 'Not Logged In' }}
          </UBadge>
        </div>

        <!-- Decoded ID Token -->
        <div v-if="isAuthenticated && idToken" class="space-y-2">
          <h2 class="text-sm font-semibold text-gray-700 dark:text-gray-300">
            Decoded ID Token
          </h2>
          <div
            class="bg-gray-950 dark:bg-gray-900 rounded-lg p-4 overflow-auto max-h-80 border border-gray-800"
          >
            <pre class="text-xs text-green-400 font-mono">{{
              JSON.stringify(idToken, null, 2)
            }}</pre>
          </div>
        </div>

        <!-- Not Logged In Message -->
        <div v-if="!isAuthenticated" class="text-center py-8 space-y-2">
          <UIcon
            name="material-symbols:lock"
            class="text-4xl text-gray-400 dark:text-gray-600"
          />
          <p class="text-gray-500 dark:text-gray-400 text-sm">
            Please log in to view your decoded ID token
          </p>
        </div>
      </div>

      <template #footer>
        <div class="flex justify-center">
          <UButton
            v-if="!isAuthenticated"
            color="primary"
            size="lg"
            class="px-8"
            @click="login"
          >
            <UIcon name="material-symbols:login" class="size-5" />
            Login
          </UButton>
          <UButton
            v-if="isAuthenticated"
            color="error"
            size="lg"
            class="px-8"
            @click="logout"
          >
            <UIcon name="material-symbols:logout" class="size-5" />
            Logout
          </UButton>
        </div>
      </template>
    </UCard>
  </div>
</template>
