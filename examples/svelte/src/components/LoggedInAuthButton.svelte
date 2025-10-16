<script lang="ts">
    import { useOidc } from "../oidc";

    const { decodedIdToken, logout } = useOidc({ assert: "user logged in" });
</script>

<div>
    <span>Hello {decodedIdToken.name}</span>
    &nbsp; &nbsp;
    <button onclick={() => logout({ redirectTo: "home" })}>Logout</button>
</div>
