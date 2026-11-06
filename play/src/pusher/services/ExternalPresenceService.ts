import type { z } from "zod";
import { ExternalPresenceBatch, EXTERNAL_PRESENCE_MAX_AGE_MS } from "../../common/ExternalPresence";

type Row = z.infer<typeof ExternalPresenceBatch>["rows"][number];
type Status = Row["status"];
type Entry = { row: Row; timer: ReturnType<typeof setTimeout> | undefined };

/** Latest snapshots survive room changes. Only the authenticated admin API can write them. */
export class ExternalPresenceService {
    private readonly entries = new Map<string, Entry>();
    private readonly listeners = new Map<string, Set<(status: Status) => void>>();

    update(payload: unknown): void {
        const { rows } = ExternalPresenceBatch.parse(payload);
        const now = Date.now();
        if (rows.some((row) => row.observedAt > now + 30_000 || row.observedAt < now - EXTERNAL_PRESENCE_MAX_AGE_MS)) {
            throw new Error("External presence snapshot outside freshness window");
        }
        const identifiers = new Set([...this.entries.keys(), ...rows.map((row) => this.key(row.identifier))]);
        if (identifiers.size > 10_000) {
            throw new Error("External presence capacity exceeded");
        }
        for (const row of rows) {
            const key = this.key(row.identifier);
            const previous = this.entries.get(key);
            if (previous && row.sequence <= previous.row.sequence) continue;
            clearTimeout(previous?.timer);
            const entry: Entry = { row, timer: undefined };
            this.entries.set(key, entry);
            this.notify(key, row.status);
            entry.timer = setTimeout(
                () => {
                    entry.timer = undefined;
                    this.notify(key, "UNKNOWN");
                },
                Math.max(0, row.observedAt + EXTERNAL_PRESENCE_MAX_AGE_MS - Date.now()),
            );
            entry.timer.unref?.();
        }
    }

    subscribe(identifier: string, listener: (status: Status) => void): () => void {
        const key = this.key(identifier);
        let listeners = this.listeners.get(key);
        if (!listeners) {
            listeners = new Set();
            this.listeners.set(key, listeners);
        }
        listeners.add(listener);
        const row = this.entries.get(key)?.row;
        // Unmapped identities keep their normal availability. Known stale entries stay conservative.
        if (row) listener(row.observedAt + EXTERNAL_PRESENCE_MAX_AGE_MS > Date.now() ? row.status : "UNKNOWN");
        return () => {
            listeners.delete(listener);
            if (listeners.size === 0) this.listeners.delete(key);
        };
    }

    dispose(): void {
        for (const entry of this.entries.values()) clearTimeout(entry.timer);
        this.entries.clear();
        this.listeners.clear();
    }

    private key(identifier: string): string {
        return identifier.trim().toLowerCase();
    }

    private notify(key: string, status: Status): void {
        for (const listener of this.listeners.get(key) ?? []) listener(status);
    }
}

export const externalPresenceService = new ExternalPresenceService();
