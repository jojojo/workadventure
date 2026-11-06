import { writable } from "svelte/store";

/** Server-provided phone state is transient and must never overwrite saved manual availability. */
export const externalPhoneBusyStore = writable(false);
