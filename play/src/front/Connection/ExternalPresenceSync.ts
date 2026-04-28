import { get } from "svelte/store";
import { AvailabilityStatus } from "@workadventure/messages";
import { axiosToPusher } from "./AxiosUtils";
import { localUserStore } from "./LocalUserStore";
import { EXTERNAL_PRESENCE_ENABLED, EXTERNAL_PRESENCE_POLL_INTERVAL } from "../Enum/EnvironmentVariable";
import { availabilityStatusStore, requestedStatusStore } from "../Stores/MediaStore";
import { resetAllStatusStoreExcept } from "../Rules/StatusRules/statusChangerFunctions";

type ExternalPresenceStatus = "ONLINE" | "BUSY" | "DO_NOT_DISTURB" | "BACK_IN_A_MOMENT";

class ExternalPresenceSync {
    private intervalId: number | undefined;
    private autoBackInAMoment = false;
    private inFlight = false;

    start() {
        if (!EXTERNAL_PRESENCE_ENABLED || this.intervalId !== undefined) {
            return;
        }

        this.poll().catch((error) => {
            console.warn("External presence initial poll failed", error);
        });

        this.intervalId = window.setInterval(() => {
            this.poll().catch((error) => {
                console.warn("External presence poll failed", error);
            });
        }, EXTERNAL_PRESENCE_POLL_INTERVAL);
    }

    stop() {
        if (this.intervalId !== undefined) {
            window.clearInterval(this.intervalId);
            this.intervalId = undefined;
        }
        this.autoBackInAMoment = false;
        this.inFlight = false;
    }

    private async poll() {
        if (this.inFlight) {
            return;
        }

        const authToken = localUserStore.getAuthToken();
        if (!authToken) {
            this.stop();
            return;
        }

        this.inFlight = true;
        try {
            const response = await axiosToPusher.get<{ status?: ExternalPresenceStatus }>(`external-presence-status?_t=${Date.now()}`, {
                headers: {
                    Authorization: authToken,
                },
            });

            if (!response.data?.status) {
                return;
            }

            this.applyStatus(response.data.status);
        } finally {
            this.inFlight = false;
        }
    }

    private applyStatus(status: ExternalPresenceStatus) {
        if (status === "BUSY") {
            if (get(requestedStatusStore) === null && get(availabilityStatusStore) === AvailabilityStatus.ONLINE) {
                resetAllStatusStoreExcept(AvailabilityStatus.BACK_IN_A_MOMENT);
                this.autoBackInAMoment = true;
            }
            return;
        }

        if (this.autoBackInAMoment && get(requestedStatusStore) === AvailabilityStatus.BACK_IN_A_MOMENT) {
            resetAllStatusStoreExcept(null);
        }
        this.autoBackInAMoment = false;
    }
}

export const externalPresenceSync = new ExternalPresenceSync();
