import { writable } from "svelte/store";

/** A locally joined external call. Overlay media and status without changing user preferences. */
export const externalMeetingActiveStore = writable(false);
