<script lang="ts">
    import { createKeycloakUtils, isKeycloak } from "oidc-spa/keycloak";
    import { getOidc, useOidc } from "../oidc";
    import { onMount } from "svelte";
    import { decodeJwt } from "oidc-spa/tools/decodeJwt";
    import { readonly, writable } from "svelte/store";

    /**
     * DIAGNOSTIC ONLY
     *
     * In real applications you should not read, display, or depend on any fields
     * from the access token. Treat it as an opaque string and use it only as:
     *
     *   Authorization: Bearer <token>
     *
     * If you need user information, use decodedIdToken or fetch it from your backend.
     * Please read the documentation or ask on our Discord if you are unsure.
     * Do not copy this pattern into production code.
     */
    function useDecodedAccessToken_DIAGNOSTIC_ONLY() {
        let decodedAccessToken = writable<
            Record<string, unknown> | null /* Opaque, not a JWT */ | undefined /* Loading */
        >(undefined);

        onMount(() => {
            let cleanup: (() => void) | undefined = undefined;
            let isActive = true;

            (async () => {
                const oidc = await getOidc();

                if (!isActive) {
                    return;
                }

                if (!oidc.isUserLoggedIn) {
                    throw new Error("Assertion error");
                }

                const update = (accessToken: string) => {
                    let decodedAccessToken_int: Record<string, unknown> | null;

                    try {
                        decodedAccessToken_int = decodeJwt(accessToken);
                    } catch {
                        decodedAccessToken_int = null;
                    }

                    decodedAccessToken.set(decodedAccessToken_int);
                };

                const { unsubscribe } = oidc.subscribeToTokensChange(tokens =>
                    update(tokens.accessToken)
                );

                cleanup = () => {
                    unsubscribe();
                };

                {
                    const { accessToken } = await oidc.getTokens();

                    if (!isActive) {
                        return;
                    }

                    update(accessToken);
                }
            })();

            return () => {
                isActive = false;
                cleanup?.();
            };
        });

        return { decodedAccessToken: readonly(decodedAccessToken) };
    }

    const {
        decodedIdToken,
        goToAuthServer,
        backFromAuthServer,
        renewTokens,
        params: { issuerUri, clientId }
    } = useOidc({
        assert: "user logged in"
    });
    const keycloakUtils = isKeycloak({ issuerUri }) ? createKeycloakUtils({ issuerUri }) : undefined;

    const { decodedAccessToken } = useDecodedAccessToken_DIAGNOSTIC_ONLY();
</script>

{#if $decodedAccessToken !== undefined}
    <h4>
        Hello {decodedIdToken.name}
        <br />
        <br />
        {#if $decodedAccessToken !== null}
            <p>Decoded Access Token:</p>
            <pre style="text-align: left; white-space: pre;">{JSON.stringify(
                    $decodedAccessToken,
                    null,
                    2
                )}</pre>
        {:else}
            <p>The Access Token issued by the IDP is opaque (Not a JWT).</p>
        {/if}
        <br />
        <button onclick={() => renewTokens()}>Renew tokens </button>
        <br />
        {#if keycloakUtils !== undefined}
            <br />
            <button
                onclick={() =>
                    goToAuthServer({
                        extraQueryParams: { kc_action: "UPDATE_PASSWORD" }
                    })}
            >
                Change Password
            </button>
            {#if backFromAuthServer?.extraQueryParams.kc_action === "UPDATE_PASSWORD"}
                <p>Result: {backFromAuthServer.result.kc_action_status}</p>
            {/if}
            <br />
            <button
                onclick={() =>
                    goToAuthServer({
                        extraQueryParams: { kc_action: "UPDATE_PROFILE" }
                    })}
            >
                Update profile
            </button>
            {#if backFromAuthServer?.extraQueryParams.kc_action === "UPDATE_PROFILE"}
                <p>Result: {backFromAuthServer.result.kc_action_status}</p>
            {/if}
            <br />
            <button
                onclick={() =>
                    goToAuthServer({
                        extraQueryParams: { kc_action: "delete_account" }
                    })}
            >
                Delete account
            </button>
            <br />
            <a
                href={keycloakUtils.getAccountUrl({
                    clientId,
                    backToAppFromAccountUrl: import.meta.env.BASE_URL
                })}
            >
                Go to Keycloak Account Management Console
            </a>
        {/if}
    </h4>
{/if}
