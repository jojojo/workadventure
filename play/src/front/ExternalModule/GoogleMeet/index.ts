import type { ExtensionModule } from "../ExtensionModule";
import { externalSvelteComponentService } from "../../Stores/Utils/externalSvelteComponentService";
import { googleMeetSession } from "./runtime";
import { GOOGLE_MEET_SUBTYPE } from "./GoogleMeetSession";
import MeetPanel from "./MeetPanel.svelte";
import MeetPropertyEditor from "./MeetPropertyEditor.svelte";
import AddMeetPropertyButton from "./AddMeetPropertyButton.svelte";

export const googleMeetModule = {
    id: "builtin-google-meet",
    calendarSynchronised: false,
    todoListSynchronized: false,
    init() {
        externalSvelteComponentService.addComponentToZone("popup", "builtin-google-meet", MeetPanel);
    },
    destroy() {
        googleMeetSession.leave();
        externalSvelteComponentService.removeComponentFromZone("popup", "builtin-google-meet");
    },
    areaMapEditor: () => ({
        [GOOGLE_MEET_SUBTYPE]: {
            AreaPropertyEditor: MeetPropertyEditor,
            AddAreaPropertyButton: AddMeetPropertyButton,
            isMeeting: true,
            managesMeetingLifecycle: true,
            shouldDisplayButton: (properties) =>
                !properties.some(
                    (property) => property.type === "extensionModule" && property.subtype === GOOGLE_MEET_SUBTYPE,
                ),
            handleAreaPropertyOnEnter(area, signal) {
                const property = area.properties.find(
                    (property) => property.type === "extensionModule" && property.subtype === GOOGLE_MEET_SUBTYPE,
                );
                if (property?.type === "extensionModule")
                    googleMeetSession.enter(area.id, area.name, property.data, signal);
            },
            handleAreaPropertyOnLeave(area) {
                googleMeetSession.leave(area?.id);
            },
        },
    }),
} satisfies ExtensionModule;
