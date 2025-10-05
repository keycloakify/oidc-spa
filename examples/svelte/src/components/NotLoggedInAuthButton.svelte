<script lang="ts">
    import { createKeycloakUtils, isKeycloak } from "oidc-spa/keycloak";
    import { useOidc } from "../oidc";

    const {
        login,
        params: { issuerUri }
    } = useOidc({ assert: "user not logged in" });

    const keycloakUtils = isKeycloak({ issuerUri }) ? createKeycloakUtils({ issuerUri }) : undefined;

    const isAuth0 = issuerUri.includes("auth0");
</script>

<div>
    <button onclick={() => login()}>Login</button>{" "}
    {#if keycloakUtils !== undefined}
        <button
            onclick={() =>
                login({
                    transformUrlBeforeRedirect: keycloakUtils.transformUrlBeforeRedirectForRegister
                })}
        >
            Register
        </button>
    {/if}
    {#if isAuth0}
        <button
            onclick={() =>
                login({
                    extraQueryParams: {
                        screen_hint: "signup"
                    }
                })}
        >
            Register
        </button>
    {/if}
</div>
