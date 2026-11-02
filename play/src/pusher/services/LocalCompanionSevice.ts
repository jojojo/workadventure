import fs from "fs/promises";
import type { CompanionTextureCollection, CompanionDetail } from "@workadventure/messages";
import type { CompanionServiceInterface } from "./CompanionServiceInterface";
import { addCustomCompanions, CUSTOM_WOKA_DIRECTORY } from "./CustomWokaCatalog";

/**
 * Companion Service list that the default list of companions
 */
export class LocalCompanionService implements CompanionServiceInterface {
    constructor(private readonly customDirectory = CUSTOM_WOKA_DIRECTORY) {}

    private async loadCompanionData(): Promise<CompanionTextureCollection[]> {
        try {
            const file = new URL("../data/companions.json", import.meta.url);
            const content = await fs.readFile(file, "utf8");
            return await addCustomCompanions(JSON.parse(content) as CompanionTextureCollection[], this.customDirectory);
        } catch (cause) {
            throw new Error("Failed to load Companion data", { cause });
        }
    }

    async getCompanionList(roomUrl: string, token: string): Promise<CompanionTextureCollection[] | undefined> {
        const companionList: CompanionTextureCollection[] = await this.loadCompanionData();
        if (!companionList) {
            return undefined;
        }
        return companionList;
    }

    async fetchCompanionDetails(textureId: string): Promise<CompanionDetail | undefined> {
        const companionList: CompanionTextureCollection[] = await this.loadCompanionData();

        for (const collection of companionList) {
            const texture = collection.textures.find((texture) => texture.id === textureId);

            if (texture) {
                return {
                    id: texture.id,
                    url: texture.url,
                };
            }
        }

        return undefined;
    }
}

export const localCompanionService = new LocalCompanionService();
