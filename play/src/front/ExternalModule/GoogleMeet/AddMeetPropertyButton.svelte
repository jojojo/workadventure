<script lang="ts">
    import LL from "../../../i18n/i18n-svelte";
    import AddPropertyButton from "../../Components/MapEditor/PropertyEditor/AddPropertyButton.svelte";
    import { IconVideo } from "@wa-icons";
    let { onclick }: { onclick?: (event: MouseEvent) => void } = $props();
</script>

<AddPropertyButton
    headerText="Google Meet"
    descriptionText={$LL.externalModule.googleMeet.description()}
    img={IconVideo}
    testId="addGoogleMeetProperty"
    {onclick}
/>
