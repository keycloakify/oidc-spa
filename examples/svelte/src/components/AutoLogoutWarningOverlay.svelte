<script lang="ts">
    import { useOidc } from "../oidc";

    const { useAutoLogoutWarningCountdown } = useOidc();
    const { secondsLeft } = useAutoLogoutWarningCountdown({ warningDurationSeconds: 45 });
</script>

{#if $secondsLeft}
    <div
        style="position: fixed; top: 0; left: 0; right: 0; bottom: 0; background-color: rgba(0,0,0,0.5); backdrop-filter: blur(10px); display: flex; justify-content: center; align-items: center; z-index: 1000;"
    >
        <div>
            <p>Are you still there?</p>
            <p>You will be logged out in {secondsLeft}</p>
        </div>
    </div>
{/if}
