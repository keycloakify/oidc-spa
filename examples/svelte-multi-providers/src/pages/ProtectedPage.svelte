<script lang="ts">
    import { decodeJwt } from "oidc-spa/tools/decodeJwt";
    import { onMount } from "svelte";
    import { readonly, writable } from "svelte/store";
    import { getOidc, useOidc_assertUserLoggedIn } from "../oidc";

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
    } = useOidc_assertUserLoggedIn();

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
    </h4>
{/if}
