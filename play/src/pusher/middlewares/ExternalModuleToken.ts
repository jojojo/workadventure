import { timingSafeEqual } from "crypto";
import type { Request, Response, NextFunction } from "express";
import { EXTERNAL_PRESENCE_MODULE_ID } from "../../common/ExternalPresence";
import { EXTERNAL_PRESENCE_API_TOKEN } from "../enums/EnvironmentVariable";
import { adminToken } from "./AdminToken";

/** The presence credential grants no access to the other admin/module operations. */
export function externalModuleToken(req: Request, res: Response, next: NextFunction): void {
    if (req.body?.data?.moduleId !== EXTERNAL_PRESENCE_MODULE_ID) {
        adminToken(req, res, next);
        return;
    }
    const expected = Buffer.from(EXTERNAL_PRESENCE_API_TOKEN ?? "");
    const received = Buffer.from(req.header("authorization") ?? "");
    if (!expected.length || expected.length !== received.length || !timingSafeEqual(expected, received)) {
        res.status(401).send("Access refused");
        return;
    }
    next();
}
