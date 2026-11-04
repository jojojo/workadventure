import * as Phaser from "phaser";
import {
    getWokaFrameSize,
    WOKA_DISPLAY_SIZE,
    HIGH_RESOLUTION_WOKA_KEY,
    HIGH_RESOLUTION_WOKA_EVENT,
} from "../../Utils/WokaFrameSize";

/** Decide the frame size after image decoding, before Phaser creates the texture's frames. */
class WokaSpriteSheetFile extends Phaser.Loader.FileTypes.SpriteSheetFile {
    public override addToCache(): void {
        let highResolution = false;
        if (this.data instanceof HTMLImageElement) {
            const size = getWokaFrameSize(this.data.naturalWidth, this.data.naturalHeight);
            this.config = { frameWidth: size, frameHeight: size };
            highResolution = size > WOKA_DISPLAY_SIZE;
        }
        super.addToCache();
        const game = this.loader.scene.game;
        if (highResolution && !game.registry.get(HIGH_RESOLUTION_WOKA_KEY)) {
            game.registry.set(HIGH_RESOLUTION_WOKA_KEY, true);
            game.events.emit(HIGH_RESOLUTION_WOKA_EVENT);
        }
    }
}

export function queueWokaTexture(loader: Phaser.Loader.LoaderPlugin, key: string, url: string): void {
    loader.addFile(new WokaSpriteSheetFile(loader, key, url, { frameWidth: 32, frameHeight: 32 }));
}

export function createWokaSprite(scene: Phaser.Scene, key: string, frame?: string | number): Phaser.GameObjects.Sprite {
    return new Phaser.GameObjects.Sprite(scene, 0, 0, key, frame).setDisplaySize(WOKA_DISPLAY_SIZE, WOKA_DISPLAY_SIZE);
}
