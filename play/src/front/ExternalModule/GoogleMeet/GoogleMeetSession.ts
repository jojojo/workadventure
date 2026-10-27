import { get, writable } from "svelte/store";
import { z } from "zod";
import { externalMeetingActiveStore } from "../../Stores/ExternalMeetingStore";

export const GOOGLE_MEET_SUBTYPE = "googleMeet";
export const googleMeetConfig = z.object({ title: z.string().default(""), url: z.string().default("") });

export function validateMeetUrl(value: string): string | undefined {
    try {
        const url = new URL(value.trim());
        if (
            url.protocol !== "https:" ||
            url.hostname !== "meet.google.com" ||
            url.port ||
            url.username ||
            url.password ||
            !(/^\/[a-z]{3}-[a-z]{4}-[a-z]{3}\/?$/.test(url.pathname) || /^\/lookup\/[\w-]+\/?$/.test(url.pathname))
        )
            return undefined;
        return url.href;
    } catch {
        return undefined;
    }
}

export interface MeetPanelState {
    areaId: string;
    title: string;
    url: string | undefined;
    active: boolean;
    blocked: boolean;
}

interface MeetingCallbacks {
    open: (url: string) => boolean;
    joined: (areaId: string) => void;
    ended: () => void;
}

/** Owns only this module's media overlay; user microphone, camera and status preferences stay intact. */
export class GoogleMeetSession {
    readonly panel = writable<MeetPanelState | undefined>(undefined);
    private removeAbortListener: (() => void) | undefined;

    constructor(private readonly callbacks: MeetingCallbacks) {}

    enter(areaId: string, name: string, data: unknown, signal: AbortSignal): void {
        if (signal.aborted) return;
        this.leave();
        const parsed = googleMeetConfig.safeParse(data);
        const config = parsed.success ? parsed.data : { title: "", url: "" };
        this.panel.set({
            areaId,
            title: config.title.trim() || name,
            url: validateMeetUrl(config.url),
            active: false,
            blocked: false,
        });
        const leave = () => this.leave(areaId);
        signal.addEventListener("abort", leave, { once: true });
        this.removeAbortListener = () => signal.removeEventListener("abort", leave);
    }

    join(): void {
        const panel = get(this.panel);
        if (!panel?.url) return;
        // Run synchronously in the click handler so browsers permit the new tab.
        if (!this.callbacks.open(panel.url)) {
            this.panel.set({ ...panel, blocked: true });
            return;
        }
        this.panel.set({ ...panel, active: true, blocked: false });
        externalMeetingActiveStore.set(true);
        if (!panel.active) this.callbacks.joined(panel.areaId);
    }

    finish(): void {
        const panel = get(this.panel);
        if (!panel?.active) return;
        externalMeetingActiveStore.set(false);
        this.panel.set({ ...panel, active: false, blocked: false });
        this.callbacks.ended();
    }

    leave(areaId?: string): void {
        if (areaId && get(this.panel)?.areaId !== areaId) return;
        this.removeAbortListener?.();
        this.removeAbortListener = undefined;
        this.finish();
        this.panel.set(undefined);
    }
}
