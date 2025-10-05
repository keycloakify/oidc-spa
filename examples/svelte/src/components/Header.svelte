<script lang="ts">
    import { route } from "@mateothegreat/svelte5-router";
    import { useOidc } from "../oidc";
    import LoggedInAuthButton from "./LoggedInAuthButton.svelte";
    import NotLoggedInAuthButton from "./NotLoggedInAuthButton.svelte";

    const { isUserLoggedIn, initializationError } = useOidc();
</script>

<div
    style="display: flex; justify-content: space-between; align-items: center; position: absolute; top: 0; left: 0; width: 100%;"
>
    <span>OIDC-SPA + Svelte5 Router</span>
    <!-- You do not have to display an error here, it's just to show that if you want you can
        But it's best to enable the user to navigate unauthenticated and to display an error
        only if he attempt to login (by default it display an alert) -->
    {#if initializationError !== undefined}
        <div style="color: red;">
            {initializationError.isAuthServerLikelyDown
                ? "Sorry our Auth server is down"
                : `Initialization error: ${initializationError.message}`}
        </div>
    {/if}

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
