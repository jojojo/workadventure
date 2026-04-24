import axios from "axios";
import { z } from "zod";

export type ThreeCxPresenceStatus = "ONLINE" | "BUSY";

export interface ThreeCxClientConfig {
    baseUrl: string;
    clientId: string;
    clientSecret: string;
    userFilterField: string;
    activeCallsPath: string;
}

const TokenResponse = z.object({
    access_token: z.string(),
    expires_in: z.number().optional(),
});

const UsersResponse = z.object({
    value: z.array(z.record(z.unknown())),
});

export class ThreeCxClient {
    private accessToken: string | undefined;
    private accessTokenExpiresAt = 0;
    private readonly extensionCache = new Map<string, string>();

    constructor(private readonly config: ThreeCxClientConfig) {}

    async getPresenceStatus(identifier: string): Promise<ThreeCxPresenceStatus> {
        const extension = await this.getExtensionForIdentifier(identifier);
        if (!extension) {
            return "ONLINE";
        }

        const token = await this.getAccessToken();
        const response = await axios.get(this.url(this.config.activeCallsPath), {
            headers: {
                Authorization: `Bearer ${token}`,
            },
            timeout: 5000,
        });

        return this.containsExtension(response.data, extension) ? "BUSY" : "ONLINE";
    }

    private async getExtensionForIdentifier(identifier: string): Promise<string | undefined> {
        const cachedExtension = this.extensionCache.get(identifier);
        if (cachedExtension) {
            return cachedExtension;
        }

        const token = await this.getAccessToken();
        const escapedIdentifier = identifier.replace(/'/g, "''");
        const usersUrl = new URL(this.url("/xapi/v1/Users"));
        usersUrl.searchParams.set("$filter", `${this.config.userFilterField} eq '${escapedIdentifier}'`);
        usersUrl.searchParams.set("$top", "1");

        const response = await axios.get(usersUrl.toString(), {
            headers: {
                Authorization: `Bearer ${token}`,
            },
            timeout: 5000,
        });

        const users = UsersResponse.parse(response.data).value;
        const extension = this.extractExtension(users[0]);
        if (extension) {
            this.extensionCache.set(identifier, extension);
        }

        return extension;
    }

    private async getAccessToken(): Promise<string> {
        const now = Date.now();
        if (this.accessToken && this.accessTokenExpiresAt > now) {
            return this.accessToken;
        }

        const body = new URLSearchParams({
            grant_type: "client_credentials",
            client_id: this.config.clientId,
            client_secret: this.config.clientSecret,
        });

        const response = await axios.post(this.url("/connect/token"), body, {
            auth: {
                username: this.config.clientId,
                password: this.config.clientSecret,
            },
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
            },
            timeout: 5000,
        });

        const tokenResponse = TokenResponse.parse(response.data);
        this.accessToken = tokenResponse.access_token;
        this.accessTokenExpiresAt = now + Math.max((tokenResponse.expires_in ?? 300) - 30, 30) * 1000;

        return tokenResponse.access_token;
    }

    private extractExtension(user: Record<string, unknown> | undefined): string | undefined {
        if (!user) {
            return undefined;
        }

        for (const key of ["Number", "number", "Extension", "extension", "Dn", "dn"]) {
            const value = user[key];
            if (typeof value === "string" && value.trim()) {
                return value.trim();
            }
            if (typeof value === "number") {
                return String(value);
            }
        }

        return undefined;
    }

    private containsExtension(value: unknown, extension: string): boolean {
        if (typeof value === "string") {
            return value === extension;
        }

        if (typeof value === "number") {
            return String(value) === extension;
        }

        if (Array.isArray(value)) {
            return value.some((item) => this.containsExtension(item, extension));
        }

        if (value && typeof value === "object") {
            return Object.entries(value).some(([key, item]) => {
                const normalizedKey = key.toLowerCase();
                if (
                    ["number", "extension", "dn", "participantnumber", "caller", "callee"].includes(normalizedKey) &&
                    this.containsExtension(item, extension)
                ) {
                    return true;
                }

                return this.containsExtension(item, extension);
            });
        }

        return false;
    }

    private url(path: string): string {
        return new URL(path, this.config.baseUrl.endsWith("/") ? this.config.baseUrl : `${this.config.baseUrl}/`).toString();
    }
}
