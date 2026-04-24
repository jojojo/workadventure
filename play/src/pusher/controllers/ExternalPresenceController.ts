import type { Application, Request } from "express";
import axios from "axios";
import { z } from "zod";
import { BaseHttpController } from "./BaseHttpController";
import { authenticated, type ResponseWithUserIdentifier } from "../middlewares/Authenticated";
import {
    EXTERNAL_PRESENCE_AUTH_TOKEN,
    EXTERNAL_PRESENCE_MATCH_FIELD,
    EXTERNAL_PRESENCE_URL,
} from "../enums/EnvironmentVariable";
import { jwtTokenManager } from "../services/JWTTokenManager";

const ExternalPresenceResponse = z
    .object({
        status: z.enum(["ONLINE", "BUSY", "DO_NOT_DISTURB", "BACK_IN_A_MOMENT"]).optional(),
        inCall: z.boolean().optional(),
    })
    .passthrough();

export class ExternalPresenceController extends BaseHttpController {
    constructor(app: Application) {
        super(app);
    }

    routes(): void {
        this.app.get(
            "/external-presence-status",
            [authenticated],
            async (req: Request, res: ResponseWithUserIdentifier) => {
                if (!EXTERNAL_PRESENCE_URL) {
                    res.status(204).send();
                    return;
                }

                const token = req.header("authorization");
                if (!token) {
                    res.status(401).send("Missing authorization header");
                    return;
                }

                const jwtData = await jwtTokenManager.verifyJWTToken(token);
                const identifier =
                    EXTERNAL_PRESENCE_MATCH_FIELD === "username" ? jwtData.username ?? jwtData.identifier : jwtData.identifier;

                if (!identifier) {
                    res.status(204).send();
                    return;
                }

                const url = new URL(EXTERNAL_PRESENCE_URL);
                url.searchParams.set(EXTERNAL_PRESENCE_MATCH_FIELD, identifier);

                const response = await axios.get(url.toString(), {
                    headers: EXTERNAL_PRESENCE_AUTH_TOKEN
                        ? {
                              Authorization: `Bearer ${EXTERNAL_PRESENCE_AUTH_TOKEN}`,
                          }
                        : undefined,
                    timeout: 5000,
                });

                const data = ExternalPresenceResponse.parse(response.data);

                res.json({
                    status: data.status ?? (data.inCall ? "BUSY" : "ONLINE"),
                });
            }
        );
    }
}
