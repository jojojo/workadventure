import path from "path";
import type { Application } from "express";
import { CUSTOM_WOKA_DIRECTORY, CUSTOM_WOKA_FILENAME } from "../services/CustomWokaCatalog";

export function registerCustomWokaRoutes(app: Application, directory = CUSTOM_WOKA_DIRECTORY): void {
    app.get("/custom-wokas/:filename", (req, res, next) => {
        const filename = req.params.filename;
        if (typeof filename !== "string" || !CUSTOM_WOKA_FILENAME.test(filename)) {
            res.status(404).end();
            return;
        }
        res.sendFile(path.join(directory, filename), { maxAge: "1y", immutable: true }, (error) => {
            if (error) {
                if ("statusCode" in error && error.statusCode === 404) {
                    res.setHeader("Cache-Control", "no-store");
                    res.status(404).end();
                    return;
                }
                next(error);
            }
        });
    });
}
