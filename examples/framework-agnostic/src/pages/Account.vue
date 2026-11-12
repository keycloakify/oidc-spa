<script setup lang="ts">
import { computed, ref } from "vue";
import { createKeycloakUtils, isKeycloak } from "oidc-spa/keycloak";
import { useOidc } from "../oidc";

const { oidc, user } = useOidc();
const isRefreshing = ref(false);
const keycloakUtils = computed(() =>
    oidc.value && isKeycloak({ issuerUri: oidc.value.issuerUri })
        ? createKeycloakUtils({ issuerUri: oidc.value.issuerUri })
        : undefined
);

async function refreshProfile() {
    const client = oidc.value;
    if (!client?.isUserLoggedIn || isRefreshing.value) return;
    isRefreshing.value = true;
    await client.refreshUser();
    isRefreshing.value = false;
}
</script>

<template>
    <template v-if="oidc?.isUserLoggedIn && user">
        <h1>Account</h1>
        <p>Your profile and account settings.</p>
        <dl>
            <dt>Name</dt>
            <dd>{{ user.displayName }}</dd>
            <template v-if="user.email"
                ><dt>Email</dt>
                <dd>{{ user.email }}</dd></template
            >
        </dl>
        <button type="button" :disabled="isRefreshing" @click="refreshProfile">
            {{ isRefreshing ? "Refreshing..." : "Refresh profile" }}
        </button>
        <template v-if="keycloakUtils">
            <div class="actions">
                <button
                    type="button"
                    @click="
                        oidc.startAuthorization({
                            authorizationParams: { kc_action: 'UPDATE_PASSWORD' }
                        })
                    "
                >
                    Change password
                </button>
                <button
                    type="button"
                    @click="
                        oidc.startAuthorization({ authorizationParams: { kc_action: 'UPDATE_PROFILE' } })
                    "
                >
                    Update profile
                </button>
                <button
                    type="button"
                    class="button-danger"
                    @click="
                        oidc.startAuthorization({ authorizationParams: { kc_action: 'delete_account' } })
                    "
                >
                    Delete account
                </button>
            </div>
            <p v-if="oidc.authorizationResult?.authorizationParams.kc_action" role="status">
                Result for {{ oidc.authorizationResult.authorizationParams.kc_action }}:
                {{ oidc.authorizationResult.response.kc_action_status }}
            </p>
            <p>
                <a
                    :href="
                        keycloakUtils.getAccountUrl({
                            clientId: oidc.clientId,
                            validRedirectUri: oidc.validRedirectUri
                        })
                    "
                    target="_blank"
                    rel="noreferrer"
                    >Open the Keycloak account console</a
                >
            </p>
        </template>
    </template>
</template>
