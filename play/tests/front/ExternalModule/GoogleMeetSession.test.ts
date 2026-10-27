import { afterEach, describe, expect, it, vi } from "vitest";
import { get } from "svelte/store";
import { GoogleMeetSession, validateMeetUrl } from "../../../src/front/ExternalModule/GoogleMeet/GoogleMeetSession";
import { externalMeetingActiveStore } from "../../../src/front/Stores/ExternalMeetingStore";

const url = "https://meet.google.com/abc-defg-hij";
function setup(opened = true) {
    const callbacks = { open: vi.fn(() => opened), joined: vi.fn(), ended: vi.fn() };
    const session = new GoogleMeetSession(callbacks);
    const controller = new AbortController();
    session.enter("area-a", "Meeting room", { url }, controller.signal);
    return { session, callbacks, controller };
}
afterEach(() => {
    externalMeetingActiveStore.set(false);
});

describe("Google Meet session", () => {
    it("only suspends WorkAdventure after a successful join, then releases the overlay on return", () => {
        const { session, callbacks } = setup();
        expect(get(externalMeetingActiveStore)).toBe(false);
        session.join();
        expect(get(externalMeetingActiveStore)).toBe(true);
        expect(callbacks.joined).toHaveBeenCalledWith("area-a");
        session.join();
        expect(callbacks.joined).toHaveBeenCalledTimes(1);
        session.finish();
        expect(get(externalMeetingActiveStore)).toBe(false);
        expect(get(session.panel)?.active).toBe(false);
        expect(callbacks.ended).toHaveBeenCalledTimes(1);
        session.leave();
        expect(callbacks.ended).toHaveBeenCalledTimes(1);
    });
    it("keeps media available when popups are blocked and allows retrying", () => {
        const { session, callbacks } = setup(false);
        session.join();
        expect(get(externalMeetingActiveStore)).toBe(false);
        expect(get(session.panel)?.blocked).toBe(true);
        expect(callbacks.joined).not.toHaveBeenCalled();
        callbacks.open.mockReturnValue(true);
        session.join();
        expect(get(externalMeetingActiveStore)).toBe(true);
        expect(get(session.panel)?.blocked).toBe(false);
        session.leave();
    });
    it("restores media when the entry is cancelled and ignores a stale area leave", () => {
        const { session, callbacks, controller } = setup();
        session.join();
        session.enter("area-b", "Other room", { url }, new AbortController().signal);
        expect(callbacks.ended).toHaveBeenCalledTimes(1);
        session.join();
        controller.abort();
        session.leave("area-a");
        expect(get(externalMeetingActiveStore)).toBe(true);
        expect(get(session.panel)?.areaId).toBe("area-b");
        session.leave("area-b");
        expect(get(externalMeetingActiveStore)).toBe(false);
        expect(get(session.panel)).toBeUndefined();
    });
    it("cleans up an active call on abort", () => {
        const { session, controller } = setup();
        session.join();
        controller.abort();
        expect(get(externalMeetingActiveStore)).toBe(false);
        expect(get(session.panel)).toBeUndefined();
    });
    it("does not join missing or invalid configuration", () => {
        const { session, callbacks } = setup();
        session.enter("invalid", "Room", {}, new AbortController().signal);
        session.join();
        expect(callbacks.open).not.toHaveBeenCalled();
        expect(get(externalMeetingActiveStore)).toBe(false);
        session.leave();
    });
    it("does not enter with an already aborted signal", () => {
        const { session, controller } = setup();
        session.leave();
        controller.abort();
        session.enter("cancelled", "Room", { url }, controller.signal);
        expect(get(session.panel)).toBeUndefined();
    });
});

describe("Google Meet URL validation", () => {
    it.each([url, `${url}?authuser=1`, "https://meet.google.com/lookup/team-room"])(
        "accepts a meeting link: %s",
        (value) => {
            expect(validateMeetUrl(` ${value} `)).toBe(value);
        },
    );
    it.each([
        "javascript:alert(1)",
        "http://meet.google.com/abc-defg-hij",
        "https://meet.google.com.evil.example/abc-defg-hij",
        "https://evil.example/",
        "https://user@meet.google.com/abc-defg-hij",
        "https://meet.google.com:8443/abc-defg-hij",
        "https://meet.google.com/new",
        "",
    ])("rejects unsafe or non-meeting links: %s", (value) => {
        expect(validateMeetUrl(value)).toBeUndefined();
    });
});
