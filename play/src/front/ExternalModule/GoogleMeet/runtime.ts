import { get } from "svelte/store";
import { externalMeetingEnded, externalMeetingStarted } from "../ExternalMeetingAnalytics";
import { gameSceneStore } from "../../Stores/GameSceneStore";
import { GOOGLE_MEET_SUBTYPE, GoogleMeetSession } from "./GoogleMeetSession";

export const googleMeetSession = new GoogleMeetSession({
    open(url) {
        const tab = window.open(url, "_blank");
        if (!tab) return false;
        // Keep the handle to detect blocked popups, but do not expose WorkAdventure to the new page.
        tab.opener = null;
        return true;
    },
    joined(areaId) {
        const scene = get(gameSceneStore);
        if (scene) externalMeetingStarted(GOOGLE_MEET_SUBTYPE, areaId, scene.roomUrl);
    },
    ended: () => externalMeetingEnded(GOOGLE_MEET_SUBTYPE),
});
