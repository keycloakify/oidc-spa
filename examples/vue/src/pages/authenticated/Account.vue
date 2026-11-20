<script setup lang="ts">
import { createKeycloakUtils, isKeycloak } from "oidc-spa/keycloak-utils";
import { useOidc } from "../../oidc";

const { user, issuerUri, clientId, validRedirectUri, startAuthorization, authorizationResult } = useOidc(
    { assert: "user logged in" }
);
const keycloakUtils = isKeycloak({ issuerUri }) ? createKeycloakUtils({ issuerUri }) : undefined;
</script>

<template>
    <h1>Account</h1>
    <p>Your profile and account settings.</p>
    <dl>
        <dt>Name</dt>
        <dd>{{ user.displayName }}</dd>
        <template v-if="user.email">
            <dt>Email</dt>
            <dd>{{ user.email }}</dd>
        </template>
    </dl>
    <template v-if="keycloakUtils">
        <div class="actions">
            <button
                type="button"
                @click="
                    startAuthorization({
                        authorizationParams: { kc_action: 'UPDATE_PASSWORD' }
                    })
                "
            >
                Change password
            </button>
            <button
                type="button"
                @click="startAuthorization({ authorizationParams: { kc_action: 'UPDATE_PROFILE' } })"
            >
                Update profile
            </button>
            <button
                type="button"
                class="button-danger"
                @click="startAuthorization({ authorizationParams: { kc_action: 'delete_account' } })"
            >
                Delete account
            </button>
        </div>
        <p v-if="authorizationResult?.authorizationParams.kc_action" role="status">
            Result for {{ authorizationResult.authorizationParams.kc_action }}:
            {{ authorizationResult.response.kc_action_status }}
        </p>
        <p>
            <a
                :href="
                    keycloakUtils.getAccountUrl({
                        clientId,
                        validRedirectUri
                    })
                "
                target="_blank"
                rel="noreferrer"
                >Open the Keycloak account console</a
            >
        </p>
    </template>
</template>
