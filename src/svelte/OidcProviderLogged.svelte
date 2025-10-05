<script lang="ts" generics="DecodedIdToken extends Record<string, unknown>">
    import type { Snippet } from "svelte";
    import { type Oidc } from "..";
    import { setOidcContext } from "./oidc.context";

    const { oidc, children }: { oidc: Oidc<DecodedIdToken>; children: Snippet } = $props();
    setOidcContext({ oidc: oidc });
</script>

{@render children()}
