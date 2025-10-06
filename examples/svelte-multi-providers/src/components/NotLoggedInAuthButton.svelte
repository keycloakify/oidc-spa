<script lang="ts">
    import { askUserToSelectProvider, useOidc_assertUserNotLoggedIn } from "../oidc";

    const oidcByProvider = useOidc_assertUserNotLoggedIn();
    const login = async () => {
        const provider = await askUserToSelectProvider();

        if (provider === undefined) {
            return;
        }
        await oidcByProvider[provider].login({
            doesCurrentHrefRequiresAuth: false
        });
    };
</script>

<div>
    <button onclick={() => login()}>Login with Google or Microsoft</button>
</div>
