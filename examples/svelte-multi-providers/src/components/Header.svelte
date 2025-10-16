<script lang="ts">
    import { route } from "@mateothegreat/svelte5-router";
    import { useIsUserLoggedIn } from "../oidc";
    import LoggedInAuthButton from "./LoggedInAuthButton.svelte";
    import NotLoggedInAuthButton from "./NotLoggedInAuthButton.svelte";

    const isUserLoggedIn = useIsUserLoggedIn();
</script>

<div
    style="display: flex; justify-content: space-between; align-items: center; position: absolute; top: 0; left: 0; width: 100%;"
>
    <span>OIDC-SPA + Svelte5: Login with Google or Microsoft example</span>

    <div>
        <a use:route href="/"> Home </a>
        &nbsp; &nbsp; &nbsp;
        <a use:route href="/protected">My protected page</a>
    </div>
    {#if isUserLoggedIn}
        <LoggedInAuthButton></LoggedInAuthButton>
    {:else}
        <NotLoggedInAuthButton></NotLoggedInAuthButton>
    {/if}
</div>
