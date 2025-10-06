<script lang="ts">
    import { useOidc_assertUserLoggedIn } from "../oidc";

    const { decodedIdToken, logout } = useOidc_assertUserLoggedIn();
</script>

<div>
    <span>Hello {decodedIdToken.name}</span>
    &nbsp; &nbsp;
    <button onclick={() => logout({ redirectTo: "home" })}>Logout</button>
</div>
