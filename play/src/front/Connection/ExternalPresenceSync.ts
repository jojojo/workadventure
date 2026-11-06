import { ExternalPresenceState } from "../../common/ExternalPresence";
import { externalPhoneBusyStore } from "../Stores/ExternalPhoneStore";

export class ExternalPresenceSync {
    stop() {
        externalPhoneBusyStore.set(false);
    }

    apply(message: unknown) {
        const result = ExternalPresenceState.safeParse(message);
        if (!result.success) return;
        // Preserve the n8n reader's conservative behavior for stale/unavailable known phones.
        externalPhoneBusyStore.set(result.data.status !== "ONLINE");
    }
}

export const externalPresenceSync = new ExternalPresenceSync();
