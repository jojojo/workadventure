<script lang="ts">
    import LL from "../../../i18n/i18n-svelte";
    import Button from "../../Components/UI/Button.svelte";
    import { googleMeetSession } from "./runtime";
    const panel = googleMeetSession.panel;
</script>

{#if $panel}
    <aside
        class="pointer-events-auto absolute right-3 top-20 z-[200] flex max-h-[70vh] w-80 max-w-[calc(100vw-1.5rem)] flex-col gap-4 overflow-y-auto rounded-xl border border-solid border-white/20 bg-contrast p-5 text-white shadow-xl"
        aria-label="Google Meet"
        data-testid="googleMeetPanel"
    >
        <div>
            <p class="m-0 text-xs opacity-70">Google Meet</p>
            <h2 class="m-0 break-words text-lg font-bold normal-case">{$panel.title || "Google Meet"}</h2>
        </div>
        <p class="m-0 text-sm">
            {$panel.active ? $LL.externalModule.googleMeet.active() : $LL.externalModule.googleMeet.description()}
        </p>
        {#if !$panel.url}
            <p class="m-0 text-sm text-danger-600" role="alert">{$LL.externalModule.googleMeet.invalidUrl()}</p>
        {:else}
            <Button variant="secondary" onclick={() => googleMeetSession.join()} dataTestId="joinGoogleMeet">
                {$panel.active ? $LL.externalModule.googleMeet.reopen() : $LL.externalModule.googleMeet.join()}
            </Button>
        {/if}
        {#if $panel.blocked}
            <p class="m-0 text-sm text-danger-600" role="alert">{$LL.externalModule.googleMeet.blocked()}</p>
        {/if}
        {#if $panel.active}
            <Button variant="light" onclick={() => googleMeetSession.finish()} dataTestId="finishGoogleMeet">
                {$LL.externalModule.googleMeet.finish()}
            </Button>
        {/if}
        <p class="m-0 text-xs opacity-70">{$LL.externalModule.googleMeet.returnHint()}</p>
    </aside>
{/if}
