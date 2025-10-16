<script lang="ts" generics="DecodedIdToken extends Record<string, unknown>">
    import type { Snippet } from "svelte";
    import type { Oidc } from "../core";

    const props: {
        oidc: Oidc<DecodedIdToken>;
        setOidcContext: (context: { oidc: Oidc<DecodedIdToken> }) => void;
        children: Snippet;
    } = $props();

    const { oidc, children, setOidcContext } = props;
    setOidcContext({ oidc });
</script>

{@render children()}
