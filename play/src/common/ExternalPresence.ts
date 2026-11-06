import { z } from "zod";

export const EXTERNAL_PRESENCE_MODULE_ID = "external-presence";
export const EXTERNAL_PRESENCE_MAX_AGE_MS = 120_000;
export const ExternalPresenceState = z.object({
    status: z.enum(["ONLINE", "BUSY", "UNKNOWN"]),
});
export const ExternalPresenceBatch = z.object({
    rows: z
        .array(
            ExternalPresenceState.extend({
                identifier: z.string().trim().min(1).max(320),
                sequence: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
                observedAt: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
            }),
        )
        .max(10_000),
});
