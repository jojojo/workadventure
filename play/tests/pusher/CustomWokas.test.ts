// @vitest-environment node
import fs from "fs/promises";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import express from "express";
import { LocalWokaService } from "../../src/pusher/services/LocalWokaService";
import { LocalCompanionService } from "../../src/pusher/services/LocalCompanionSevice";
import { registerCustomWokaRoutes } from "../../src/pusher/controllers/CustomWokaController";

const filename = "a".repeat(64) + ".png";
const entry = { id: "custom-alice", name: "Alice", filename };
let directory: string;

async function writeCatalog(wokas = [entry]) {
    await fs.writeFile(path.join(directory, "catalog.json"), JSON.stringify({ version: 1, wokas }));
}

beforeEach(async () => {
    directory = await fs.mkdtemp(path.join(os.tmpdir(), "custom-wokas-"));
});
afterEach(async () => {
    await fs.rm(directory, { recursive: true, force: true });
});

describe("persistent custom Wokas", () => {
    it("keeps existing companions and accepts legacy catalogs without companion entries", async () => {
        const service = new LocalCompanionService(directory);
        expect(await service.fetchCompanionDetails("dog1")).toMatchObject({ id: "dog1" });
        await writeCatalog();
        expect(await service.fetchCompanionDetails("cat1")).toMatchObject({ id: "cat1" });
        expect(await service.fetchCompanionDetails(entry.id)).toBeUndefined();
    });

    it("discovers new companions and replacements without reinitializing either service", async () => {
        const service = new LocalCompanionService(directory);
        const wokaService = new LocalWokaService(directory);
        const companion = { ...entry, id: "custom-companion-felix", behavior: "cat" };
        expect(await service.fetchCompanionDetails(companion.id)).toBeUndefined();
        await fs.writeFile(
            path.join(directory, "catalog.json"),
            JSON.stringify({ version: 1, wokas: [entry], companions: [companion] }),
        );
        expect(await service.fetchCompanionDetails(companion.id)).toEqual({
            id: companion.id,
            url: `/custom-wokas/${filename}`,
        });
        const list = await service.getCompanionList("", "");
        expect(list?.at(-1)?.textures[0]).toMatchObject({ id: companion.id, behavior: "cat" });
        expect(await wokaService.fetchWokaDetails([entry.id])).toHaveLength(1);
        expect(await wokaService.fetchWokaDetails([companion.id])).toBeUndefined();
        const replacement = { ...companion, filename: "b".repeat(64) + ".png" };
        await fs.writeFile(
            path.join(directory, "catalog.json"),
            JSON.stringify({ version: 1, wokas: [entry], companions: [replacement] }),
        );
        expect(await service.fetchCompanionDetails(companion.id)).toMatchObject({
            url: `/custom-wokas/${replacement.filename}`,
        });
        expect(await service.fetchCompanionDetails("dog1")).toBeDefined();
    });

    it("can replace a built-in companion without duplicating its identifier", async () => {
        await fs.writeFile(
            path.join(directory, "catalog.json"),
            JSON.stringify({ version: 1, wokas: [], companions: [{ ...entry, id: "dog1" }] }),
        );
        const service = new LocalCompanionService(directory);
        const list = await service.getCompanionList("", "");
        expect(list?.flatMap((c) => c.textures).filter((t) => t.id === "dog1")).toHaveLength(1);
        expect(await service.fetchCompanionDetails("dog1")).toMatchObject({ url: `/custom-wokas/${filename}` });
    });

    it.each(["duplicate", "behavior", "filename"])("rejects invalid companions: %s", async (kind) => {
        const companion = {
            ...entry,
            id: kind === "duplicate" ? entry.id : "custom-companion-felix",
            behavior: kind === "behavior" ? "unknown" : "cat",
            filename: kind === "filename" ? "../secret" : filename,
        };
        await fs.writeFile(
            path.join(directory, "catalog.json"),
            JSON.stringify({ version: 1, wokas: [entry], companions: [companion] }),
        );
        await expect(new LocalCompanionService(directory).getCompanionList("", "")).rejects.toThrow();
        await expect(new LocalWokaService(directory).getWokaList("", "")).rejects.toThrow();
    });
    it("keeps built-in characters and layers when no catalog exists", async () => {
        const service = new LocalWokaService(directory);
        const catalog = await service.getWokaList("", "");
        expect(catalog?.woka.collections.flatMap((c) => c.textures).some((t) => t.id === "male1")).toBe(true);
        expect(await service.fetchWokaDetails(["male1"])).toHaveLength(1);
    });

    it("discovers additions and replacements on the same service instance", async () => {
        const service = new LocalWokaService(directory);
        expect(await service.fetchWokaDetails([entry.id])).toBeUndefined();
        await writeCatalog();
        expect(await service.fetchWokaDetails([entry.id])).toEqual([
            { id: entry.id, url: `/custom-wokas/${filename}` },
        ]);
        const replacement = { ...entry, filename: "b".repeat(64) + ".png" };
        await writeCatalog([replacement]);
        const catalog = await service.getWokaList("", "");
        expect(catalog?.woka.collections.at(-1)?.textures[0]).toMatchObject({
            id: entry.id,
            url: `/custom-wokas/${replacement.filename}`,
        });
        expect(await service.fetchWokaDetails(["male1", entry.id])).toHaveLength(2);
        expect(await service.fetchWokaDetails(["missing"])).toBeUndefined();
    });

    it("preserves a built-in character identifier when moving it to the persistent catalog", async () => {
        await writeCatalog([{ ...entry, id: "eoloa-johan" }]);
        const catalog = await new LocalWokaService(directory).getWokaList("", "");
        const matches = catalog?.woka.collections.flatMap((c) => c.textures).filter((t) => t.id === "eoloa-johan");
        expect(matches).toHaveLength(1);
        expect(matches?.[0].url).toBe(`/custom-wokas/${filename}`);
    });

    it.each(["duplicate", "layer", "path"])("rejects invalid custom catalog entries: %s", async (kind) => {
        const service = new LocalWokaService(directory);
        const base = await service.getWokaList("", "");
        const layer = base?.hair.collections[0].textures[0];
        expect(layer).toBeDefined();
        const wokas =
            kind === "duplicate"
                ? [entry, entry]
                : kind === "layer"
                  ? [{ ...entry, id: layer?.id ?? "" }]
                  : [{ ...entry, filename: "../secret" }];
        await writeCatalog(wokas);
        await expect(service.getWokaList("", "")).rejects.toThrow();
    });

    it("serves only immutable PNG names and never exposes the catalog or staging files", async () => {
        await writeCatalog();
        const png = await fs.readFile(
            new URL("../../public/resources/characters/pipoya/bonhomme-chauve-barbe-lunettes-v2.png", import.meta.url),
        );
        await fs.writeFile(path.join(directory, filename), png);
        const app = express();
        registerCustomWokaRoutes(app, directory);
        const server = app.listen(0, "127.0.0.1");
        try {
            await new Promise<void>((resolve) => {
                server.once("listening", resolve);
            });
            const address = server.address();
            if (!address || typeof address === "string") throw new Error("Missing local test server address");
            const base = `http://127.0.0.1:${address.port}/custom-wokas/`;
            const response = await fetch(base + filename);
            expect(response.status).toBe(200);
            expect(response.headers.get("cache-control")).toContain("immutable");
            expect(Array.from(new Uint8Array(await response.arrayBuffer()))).toEqual(Array.from(png));
            await Promise.all(
                ["catalog.json", ".catalog-staging.json", "image.png", "../catalog.json"].map(async (denied) => {
                    expect((await fetch(base + denied)).status).toBe(404);
                }),
            );
        } finally {
            await new Promise<void>((resolve, reject) => {
                server.close((error) => {
                    if (error) {
                        reject(error);
                    } else {
                        resolve();
                    }
                });
            });
        }
    });
});
