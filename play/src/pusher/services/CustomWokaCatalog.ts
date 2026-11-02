import fs from "fs/promises";
import path from "path";
import { z } from "zod";
import { asError } from "catch-unknown";
import type { WokaList } from "@workadventure/messages";

export const CUSTOM_WOKA_DIRECTORY = "/var/lib/workadventure/wokas";
export const CUSTOM_WOKA_FILENAME = /^[a-f0-9]{64}\.png$/;

const customWokaCatalog = z.object({
    version: z.literal(1),
    wokas: z
        .array(
            z.object({
                id: z.string().regex(/^[a-z0-9][a-z0-9-]{0,79}$/),
                name: z.string().trim().min(1).max(80),
                filename: z.string().regex(CUSTOM_WOKA_FILENAME),
            }),
        )
        .max(1000),
});

export async function addCustomWokas(base: WokaList, directory = CUSTOM_WOKA_DIRECTORY): Promise<WokaList> {
    let content: string;
    try {
        content = await fs.readFile(path.join(directory, "catalog.json"), "utf8");
    } catch (cause) {
        const error = asError(cause);
        if ("code" in error && error.code === "ENOENT") {
            return base;
        }
        throw new Error("Could not read the custom Woka catalog", { cause });
    }
    const catalog = customWokaCatalog.parse(JSON.parse(content));
    const customIds = new Set(catalog.wokas.map((woka) => woka.id));
    if (customIds.size !== catalog.wokas.length) {
        throw new Error("Duplicate custom Woka identifiers");
    }
    for (const [part, data] of Object.entries(base)) {
        if (
            part !== "woka" &&
            data.collections.some((collection) => collection.textures.some((t) => customIds.has(t.id)))
        ) {
            throw new Error("Custom Woka identifier conflicts with a character layer");
        }
    }
    if (!catalog.wokas.length) {
        return base;
    }
    return {
        ...base,
        woka: {
            ...base.woka,
            collections: [
                ...(base.woka?.collections ?? []).map((collection) => ({
                    ...collection,
                    textures: collection.textures.filter((texture) => !customIds.has(texture.id)),
                })),
                {
                    name: "Eoloa",
                    textures: catalog.wokas.map((woka) => ({
                        id: woka.id,
                        name: woka.name,
                        url: `/custom-wokas/${woka.filename}`,
                    })),
                },
            ],
        },
    };
}
