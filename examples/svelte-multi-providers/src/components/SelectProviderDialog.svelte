<script lang="ts">
    import { onDestroy } from "svelte";
    import { evtIsModalOpen, evtProviderSelected, type Provider } from "../oidc";

    let dialog = $state<HTMLDialogElement | null>(null);

    // Subscribe to evt changes
    const { detach } = evtIsModalOpen.attach(isOpen => {
        if (isOpen) {
            dialog?.showModal();
        } else {
            dialog?.close();
        }
    });

    onDestroy(detach);

    function selectProvider(provider: Provider | undefined) {
        evtProviderSelected.post(provider);
    }
</script>

<dialog bind:this={dialog} onclose={() => selectProvider(undefined)}>
    <div style="padding: 1rem;">
        <h3>Login with</h3>

        <button
            onclick={() => {
                selectProvider("google");
            }}>Google</button
        >
        &nbsp;
        <button
            onclick={() => {
                selectProvider("microsoft");
            }}>Microsoft</button
        >
    </div>
</dialog>
