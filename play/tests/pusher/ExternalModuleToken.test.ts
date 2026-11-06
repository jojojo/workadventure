import { describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";
vi.mock("../../src/pusher/enums/EnvironmentVariable", () => ({
    EXTERNAL_PRESENCE_API_TOKEN: "test-presence-credential-32-characters",
}));
vi.mock("../../src/pusher/middlewares/AdminToken", () => ({ adminToken: vi.fn() }));
import { externalModuleToken } from "../../src/pusher/middlewares/ExternalModuleToken";
import { adminToken } from "../../src/pusher/middlewares/AdminToken";
function request(moduleId: string, credential: string) {
    return { body: { data: { moduleId } }, header: () => credential } as unknown as Request;
}
function response() {
    const send = vi.fn();
    const status = vi.fn(() => ({ send }));
    const res = { status } as unknown as Response;
    return { res, status };
}
describe("presence API credential", () => {
    it("authorizes a presence event only with its own credential", () => {
        const next = vi.fn();
        externalModuleToken(
            request("external-presence", "test-presence-credential-32-characters"),
            response().res,
            next,
        );
        expect(next).toHaveBeenCalledOnce();
        for (const credential of ["", "invalid", "test-presence-credential-32-characterX"]) {
            const { res, status } = response();
            externalModuleToken(request("external-presence", credential), res, next);
            expect(status).toHaveBeenCalledWith(401);
        }
        expect(next).toHaveBeenCalledOnce();
    });
    it("keeps other modules protected by the existing admin authentication", () => {
        const req = request("other-module", "test-presence-credential-32-characters");
        const { res } = response();
        const next = vi.fn();
        externalModuleToken(req, res, next);
        expect(adminToken).toHaveBeenCalledWith(req, res, next);
        expect(next).not.toHaveBeenCalled();
    });
});
