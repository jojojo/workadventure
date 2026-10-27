import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { get } from "svelte/store";
import { AvailabilityStatus } from "@workadventure/messages";
import { externalMeetingActiveStore } from "../../../src/front/Stores/ExternalMeetingStore";
import {
    availabilityStatusStore,
    mediaStreamConstraintsStore,
    requestedStatusStore,
    requestedCameraState,
    requestedMicrophoneState,
    inBackgroundSettingsStore,
} from "../../../src/front/Stores/MediaStore";
import { myCameraStore, myMicrophoneStore } from "../../../src/front/Stores/MyMediaStore";

// Supply browser storage independently of Node's optional localStorage global.
vi.hoisted(() => {
    const values = new Map<string, string>();
    vi.stubGlobal("localStorage", {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
        removeItem: (key: string) => values.delete(key),
        clear: () => values.clear(),
    });
});
afterAll(() => {
    vi.unstubAllGlobals();
});

vi.mock("../../../src/front/Components/ActionBar/AvailabilityStatus/statusChanger", () => ({
    statusChanger: { allowNotificationSound: () => false },
}));
vi.mock("../../../src/front/Administration/AnalyticsClient", () => ({
    analyticsClient: { trackAdminEvent: vi.fn(), openTimedEvent: () => () => {} },
}));
vi.mock("../../../src/front/Administration/CurrentMeeting", () => ({ openTimedEventPerMeeting: () => () => {} }));
vi.mock("../../../src/front/Stores/PrivacyShutdownStore", async () => ({
    privacyShutdownStore: (await import("svelte/store")).writable(false),
}));
vi.mock("../../../src/front/Stores/PeerStore", async () => ({
    videoStreamElementsStore: (await import("svelte/store")).writable([]),
    screenShareStreamElementsStore: (await import("svelte/store")).writable([]),
}));

const previous = {
    camera: get(requestedCameraState),
    microphone: get(requestedMicrophoneState),
    myCamera: get(myCameraStore),
    myMicrophone: get(myMicrophoneStore),
    status: get(requestedStatusStore),
    background: get(inBackgroundSettingsStore),
};

afterEach(() => {
    externalMeetingActiveStore.set(false);
    inBackgroundSettingsStore.set(previous.background);
    requestedStatusStore.set(previous.status);
    myCameraStore.set(previous.myCamera);
    myMicrophoneStore.set(previous.myMicrophone);
    if (previous.camera) requestedCameraState.enableWebcam();
    else requestedCameraState.disableWebcam();
    if (previous.microphone) requestedMicrophoneState.enableMicrophone();
    else requestedMicrophoneState.disableMicrophone();
});

describe("Google Meet media overlay", () => {
    it("releases both capture devices and restores the existing preferences, including background preview", () => {
        requestedCameraState.enableWebcam();
        requestedMicrophoneState.disableMicrophone();
        myCameraStore.set(true);
        myMicrophoneStore.set(true);
        requestedStatusStore.set(AvailabilityStatus.DO_NOT_DISTURB);
        inBackgroundSettingsStore.set(true);
        externalMeetingActiveStore.set(true);
        expect(get(availabilityStatusStore)).toBe(AvailabilityStatus.BUSY);
        expect(get(mediaStreamConstraintsStore)).toMatchObject({ audio: false, video: false });
        expect(get(requestedCameraState)).toBe(true);
        expect(get(requestedMicrophoneState)).toBe(false);
        externalMeetingActiveStore.set(false);
        expect(get(availabilityStatusStore)).toBe(AvailabilityStatus.DO_NOT_DISTURB);
        expect(get(requestedCameraState)).toBe(true);
        expect(get(requestedMicrophoneState)).toBe(false);
    });
});

// Device/UI orchestration cycles back into MediaStore; keep the real constraint derivation under test.
vi.mock("../../../src/front/WebRtc/MediaManager", () => ({ mediaManager: {} }));
vi.mock("../../../src/front/Stores/HelpSettingsStore", () => ({ hideHelpCameraSettings: vi.fn() }));
vi.mock("../../../src/front/Stores/IsStreamingStore", async () => {
    const { writable } = await import("svelte/store");
    return { isLiveStreamingAudioStore: writable(false), isLiveStreamingStore: writable(false) };
});
