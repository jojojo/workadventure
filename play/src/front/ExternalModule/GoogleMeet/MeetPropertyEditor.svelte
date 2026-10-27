<script lang="ts">
    import type { AreaDataProperties } from "@workadventure/map-editor";
    import { untrack } from "svelte";
    import LL from "../../../i18n/i18n-svelte";
    import Input from "../../Components/Input/Input.svelte";
    import PropertyEditorBase from "../../Components/MapEditor/PropertyEditor/PropertyEditorBase.svelte";
    import { googleMeetConfig, validateMeetUrl } from "./GoogleMeetSession";

    interface Props {
        property: Extract<AreaDataProperties[number], { type: "extensionModule" }>;
        onchange?: () => void;
        onclose?: () => void;
    }
    let { property = $bindable(), onchange, onclose }: Props = $props();
    const initial = untrack(() => googleMeetConfig.safeParse(property.data));
    let title = $state(initial.success ? initial.data.title : "");
    let url = $state(initial.success ? initial.data.url : "");
    function update() {
        property.data = { title, url: url.trim() };
        onchange?.();
    }
</script>

<PropertyEditorBase {onclose}>
    {#snippet header()}Google Meet{/snippet}
    {#snippet content()}
        <div class="flex flex-col gap-3">
            <Input
                id="googleMeetTitle"
                label={$LL.externalModule.googleMeet.titleLabel()}
                bind:value={title}
                onchange={update}
            />
            <Input
                id="googleMeetUrl"
                type="url"
                label={$LL.externalModule.googleMeet.urlLabel()}
                placeholder="https://meet.google.com/abc-defg-hij"
                bind:value={url}
                onchange={update}
            />
            {#if url && !validateMeetUrl(url)}
                <p class="text-sm text-danger-600" role="alert">{$LL.externalModule.googleMeet.invalidUrl()}</p>
            {/if}
            <p class="text-sm">{$LL.externalModule.googleMeet.description()}</p>
        </div>
    {/snippet}
</PropertyEditorBase>
