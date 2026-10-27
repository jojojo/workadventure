import { afterEach, describe, expect, it, vi } from "vitest";
import { flushSync, mount, unmount } from "svelte";
import { get } from "svelte/store";
import { setLocale } from "../../../src/i18n/i18n-svelte";
import { loadLocale } from "../../../src/i18n/i18n-util.sync";
import { GoogleMeetSession } from "../../../src/front/ExternalModule/GoogleMeet/GoogleMeetSession";
import { externalMeetingActiveStore } from "../../../src/front/Stores/ExternalMeetingStore";
import MeetPanel from "../../../src/front/ExternalModule/GoogleMeet/MeetPanel.svelte";
import { googleMeetSession } from "../../../src/front/ExternalModule/GoogleMeet/runtime";

vi.mock("../../../src/front/ExternalModule/GoogleMeet/runtime", async () => {
    const { GoogleMeetSession } = await import("../../../src/front/ExternalModule/GoogleMeet/GoogleMeetSession");
    return { googleMeetSession: new GoogleMeetSession({ open: () => true, joined: () => {}, ended: () => {} }) };
});

let component: ReturnType<typeof mount> | undefined;
afterEach(async () => {
    googleMeetSession.leave();
    const mounted = component;
    component = undefined;
    if (mounted) await unmount(mounted);
});

describe("Google Meet panel", () => {
    it("joins and ends a meeting through the visible controls", () => {
        // Use the actual session and media overlay, only replace opening a real Meet tab.
        expect(googleMeetSession).toBeInstanceOf(GoogleMeetSession);
        loadLocale("fr-FR");
        setLocale("fr-FR");
        googleMeetSession.enter(
            "room",
            "Salle équipe",
            { url: "https://meet.google.com/abc-defg-hij" },
            new AbortController().signal,
        );
        const target = document.createElement("div");
        component = mount(MeetPanel, { target });
        flushSync();
        expect(target.textContent).toContain("Salle équipe");
        const join = target.querySelector<HTMLButtonElement>('[data-testid="joinGoogleMeet"]');
        expect(join?.textContent).toContain("Rejoindre Google Meet");
        join?.click();
        flushSync();
        expect(get(externalMeetingActiveStore)).toBe(true);
        expect(target.textContent).toContain("Rouvrir Google Meet");
        target.querySelector<HTMLButtonElement>('[data-testid="finishGoogleMeet"]')?.click();
        flushSync();
        expect(get(externalMeetingActiveStore)).toBe(false);
        expect(target.textContent).toContain("Rejoindre Google Meet");
        googleMeetSession.leave();
        flushSync();
        expect(target.querySelector('[data-testid="googleMeetPanel"]')).toBeNull();
    });
});
