import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ExternalPresenceService } from "../../src/pusher/services/ExternalPresenceService";

let service: ExternalPresenceService;
let cleanups: (() => void)[];
function listen(...args: Parameters<ExternalPresenceService["subscribe"]>) {
    const unsubscribe = service.subscribe(...args);
    cleanups.push(unsubscribe);
    return unsubscribe;
}
beforeEach(() => {
    vi.useFakeTimers();
    service = new ExternalPresenceService();
    cleanups = [];
});
afterEach(() => {
    for (const cleanup of cleanups) cleanup();
    service.dispose();
    vi.useRealTimers();
});
const row = (status = "BUSY", sequence = 1, identifier = "person@example.invalid") => ({
    identifier,
    status,
    sequence,
    observedAt: Date.now(),
});

describe("external presence events", () => {
    it("targets every tab of the correct identity and restores the latest snapshot on room changes", () => {
        const first = vi.fn();
        const second = vi.fn();
        const other = vi.fn();
        const leave = listen("Person@example.invalid", first);
        listen("person@example.invalid", second);
        listen("other@example.invalid", other);
        service.update({ rows: [row()] });
        expect(first).toHaveBeenLastCalledWith("BUSY");
        expect(second).toHaveBeenLastCalledWith("BUSY");
        expect(other).not.toHaveBeenCalled();
        leave();
        service.update({ rows: [row("ONLINE", 2)] });
        expect(first).toHaveBeenCalledTimes(1);
        const rejoin = vi.fn();
        listen("person@example.invalid", rejoin);
        expect(rejoin).toHaveBeenCalledWith("ONLINE");
    });
    it("ignores duplicated and out-of-order events, including after the entry expires", () => {
        service.update({ rows: [row("BUSY", 3)] });
        const listener = vi.fn();
        listen("person@example.invalid", listener);
        service.update({ rows: [row("ONLINE", 2), row("ONLINE", 3)] });
        expect(listener).toHaveBeenCalledTimes(1);
        vi.advanceTimersByTime(120_000);
        expect(listener).toHaveBeenLastCalledWith("UNKNOWN");
        service.update({ rows: [row("ONLINE", 2)] });
        expect(listener).toHaveBeenCalledTimes(2);
        service.update({ rows: [row("ONLINE", 4)] });
        expect(listener).toHaveBeenLastCalledWith("ONLINE");
    });
    it("rejects the entire invalid batch before changing any presence", () => {
        const listener = vi.fn();
        listen("person@example.invalid", listener);
        expect(() => service.update({ rows: [row(), row("invalid", 2)] })).toThrow();
        expect(() => service.update({ rows: [{ ...row(), observedAt: Date.now() + 30_001 }] })).toThrow();
        expect(() => service.update({ rows: [{ ...row(), observedAt: Date.now() - 120_001 }] })).toThrow();
        expect(listener).not.toHaveBeenCalled();
    });
    it("expires relative to the observation time and does not extend freshness on retries", () => {
        service.update({ rows: [{ ...row("ONLINE"), observedAt: Date.now() - 100_000 }] });
        const listener = vi.fn();
        listen("person@example.invalid", listener);
        vi.advanceTimersByTime(20_000);
        expect(listener).toHaveBeenLastCalledWith("UNKNOWN");
        const rejoin = vi.fn();
        listen("person@example.invalid", rejoin);
        expect(rejoin).toHaveBeenCalledWith("UNKNOWN");
    });
});
