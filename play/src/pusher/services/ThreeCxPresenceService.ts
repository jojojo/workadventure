import {
    THREE_CX_ACTIVE_CALLS_PATH,
    THREE_CX_BASE_URL,
    THREE_CX_CLIENT_ID,
    THREE_CX_CLIENT_SECRET,
    THREE_CX_USER_FILTER_FIELD,
} from "../enums/EnvironmentVariable";
import { ThreeCxClient, type ThreeCxPresenceStatus } from "./ThreeCxClient";

class ThreeCxPresenceService {
    private client: ThreeCxClient | undefined;

    isEnabled(): boolean {
        return !!(THREE_CX_BASE_URL && THREE_CX_CLIENT_ID && THREE_CX_CLIENT_SECRET);
    }

    async getStatus(identifier: string): Promise<ThreeCxPresenceStatus> {
        if (!this.isEnabled()) {
            return "ONLINE";
        }

        return this.getClient().getPresenceStatus(identifier);
    }

    private getClient(): ThreeCxClient {
        if (!THREE_CX_BASE_URL || !THREE_CX_CLIENT_ID || !THREE_CX_CLIENT_SECRET) {
            throw new Error("Missing 3CX configuration");
        }

        if (!this.client) {
            this.client = new ThreeCxClient({
                baseUrl: THREE_CX_BASE_URL,
                clientId: THREE_CX_CLIENT_ID,
                clientSecret: THREE_CX_CLIENT_SECRET,
                userFilterField: THREE_CX_USER_FILTER_FIELD,
                activeCallsPath: THREE_CX_ACTIVE_CALLS_PATH,
            });
        }

        return this.client;
    }
}

export const threeCxPresenceService = new ThreeCxPresenceService();
