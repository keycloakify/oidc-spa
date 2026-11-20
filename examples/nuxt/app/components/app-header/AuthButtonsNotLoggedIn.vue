<script setup lang="ts">
import { createKeycloakUtils, isKeycloak } from "oidc-spa/keycloak-utils";
import { useOidc } from "../../oidc";

const { login, issuerUri } = useOidc({ assert: "user not logged in" });

const keycloakUtils = isKeycloak({ issuerUri }) ? createKeycloakUtils({ issuerUri }) : undefined;
</script>

<template>
    <button type="button" class="button-primary" @click="login({})">Login</button>
    <button
        v-if="keycloakUtils"
        type="button"
        @click="
            login({
                transformAuthorizationUrl: keycloakUtils.transformAuthorizationUrl_register
            })
        "
    >
        Register
    </button>
</template>
