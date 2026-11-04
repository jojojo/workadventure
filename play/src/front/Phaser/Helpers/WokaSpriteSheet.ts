import * as Phaser from "phaser";
import { getWokaFrameSize, WOKA_DISPLAY_SIZE } from "../../Utils/WokaFrameSize";

/** Decide the frame size after image decoding, before Phaser creates the texture's frames. */
class WokaSpriteSheetFile extends Phaser.Loader.FileTypes.SpriteSheetFile {
    public override addToCache(): void {
        if (this.data instanceof HTMLImageElement) {
            const size = getWokaFrameSize(this.data.naturalWidth, this.data.naturalHeight);
            this.config = { frameWidth: size, frameHeight: size };
        }
        super.addToCache();
    }
}

export function queueWokaTexture(loader: Phaser.Loader.LoaderPlugin, key: string, url: string): void {
    loader.addFile(new WokaSpriteSheetFile(loader, key, url, { frameWidth: 32, frameHeight: 32 }));
}

export function createWokaSprite(scene: Phaser.Scene, key: string, frame?: string | number): Phaser.GameObjects.Sprite {
    return new Phaser.GameObjects.Sprite(scene, 0, 0, key, frame).setDisplaySize(WOKA_DISPLAY_SIZE, WOKA_DISPLAY_SIZE);
}
