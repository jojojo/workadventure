#!/usr/bin/env node
// Isolated browser check: real Phaser loader, sprites, animations and Svelte avatar previews.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const require = createRequire(path.join(root, "play/package.json"));
const { createServer } = require("vite");
const { chromium } = require("@playwright/test");
const { svelte, vitePreprocess } = await import(
  require.resolve("@sveltejs/vite-plugin-svelte")
);
const output = path.resolve(
  process.argv[2] ??
    path.join(os.homedir(), ".local/state/workadventure/woka-resolution-test"),
);
await mkdir(output, { recursive: true });
const imports = "/__woka-resolution-imports.js";
const viewportStore = "/__woka-resolution-viewport.js";
const server = await createServer({
  configFile: false,
  root: path.join(root, "play"),
  cacheDir: path.join(os.tmpdir(), "workadventure-woka-resolution-vite"),
  define: { global: "globalThis" },
  server: { host: "127.0.0.1", port: 0 },
  optimizeDeps: {
    noDiscovery: true,
    include: [
      "phaser",
      "debug",
      "cancelable-promise",
      "svelte",
      "svelte/internal/client",
    ],
  },
  plugins: [
    svelte({ configFile: false, preprocess: vitePreprocess() }),
    {
      name: "woka-resolution-test",
      enforce: "pre",
      resolveId(id, importer) {
        if (
          importer?.endsWith("/WaScaleManager.ts") &&
          id.endsWith("/Stores/CoWebsiteStore")
        )
          return viewportStore;
        if (id === imports) return id;
      },
      load(id) {
        if (id === viewportStore)
          return "export const coWebsiteManager = {getGameSize:()=>({width:650,height:180})};";
        if (id === imports)
          return `
                    export * as Phaser from "phaser";
                    export { mount } from "svelte";
                    export { default as WokaImage } from "/src/front/Components/Woka/WokaImage.svelte";
                    export { queueWokaTexture, createWokaSprite } from "/src/front/Phaser/Helpers/WokaSpriteSheet.ts";
                    export { SuperLoaderPlugin } from "/src/front/Phaser/Services/SuperLoaderPlugin.ts";
                    export { getPlayerAnimations } from "/src/front/Phaser/Player/Animation.ts";
                    export { WaScaleManager } from "/src/front/Phaser/Services/WaScaleManager.ts";
                `;
      },
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          if (req.url !== "/__woka-resolution") return next();
          res.setHeader("Content-Type", "text/html");
          res.end(`<!doctype html><html><head><meta charset="utf-8"><title>Woka 32 / 64 / 128</title><style>
                    body{background:#101926;color:#e5edf5;font:15px system-ui;margin:28px}h1{font-size:24px}
                    .row{display:flex;gap:16px;margin:12px 0}.preview{background:#203249;border-radius:8px;padding:8px;text-align:center}
                    canvas{image-rendering:pixelated}small{color:#aac1db}#world{margin-top:12px}
                    </style></head><body><h1>Avatars : poses de 32, 64 et 128 pixels</h1>
                    <p>Même taille dans le monde. Quatre directions et zoom ×4.</p><div id="previews"></div><div id="world"></div></body></html>`);
        });
      },
    },
  ],
});
let browser;
try {
  await server.listen();
  const address = server.httpServer.address();
  assert.ok(address && typeof address !== "string");
  browser = await chromium.launch({
    channel: process.env.WOKA_TEST_BROWSER_CHANNEL || "chrome",
    headless: true,
  });
  const page = await browser.newPage({
    viewport: { width: 900, height: 820 },
    deviceScaleFactor: Number(process.env.WOKA_TEST_DPR || 1),
  });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${address.port}/__woka-resolution`);
  const avatar = process.env.WOKA_TEST_AVATAR
    ? `data:image/png;base64,${(await readFile(process.env.WOKA_TEST_AVATAR)).toString("base64")}`
    : undefined;
  const avatarSize = process.env.WOKA_TEST_AVATAR
    ? (await readFile(process.env.WOKA_TEST_AVATAR)).readUInt32BE(16) / 3
    : 128;
  assert.ok(
    [64, 128].includes(avatarSize),
    "Expected a 192x256 or 384x512 avatar sheet",
  );
  const result = await page.evaluate(
    async ({ renderer, avatar, avatarSize }) => {
      const {
        Phaser,
        mount,
        WokaImage,
        queueWokaTexture,
        createWokaSprite,
        SuperLoaderPlugin,
        getPlayerAnimations,
        WaScaleManager,
      } = await import("/__woka-resolution-imports.js");
      const makeSheet = (size) => {
        const canvas = document.createElement("canvas");
        canvas.width = size * 3;
        canvas.height = size * 4;
        const context = canvas.getContext("2d");
        const colors = ["#34c6d3", "#f2aa4b", "#c084ed", "#62d49a"];
        for (let direction = 0; direction < 4; direction++) {
          for (let pose = 0; pose < 3; pose++) {
            context.save();
            context.translate(pose * size, direction * size);
            context.scale(size / 128, size / 128);
            context.fillStyle = colors[direction];
            context.fillRect(0, 0, 12, 12);
            context.fillStyle = "#172338";
            const step = pose === 1 ? 0 : pose === 0 ? -5 : 5;
            context.fillRect(42, 81, 17, 36 + step);
            context.fillRect(69, 81, 17, 36 - step);
            context.fillStyle = "#f4f5fa";
            context.fillRect(37, 111 + step, 24, 10);
            context.fillRect(67, 111 - step, 24, 10);
            context.fillStyle = colors[direction];
            context.fillRect(36, 47, 56, 40);
            context.fillStyle = "#f6c8a2";
            context.fillRect(25, 50, 12, 32);
            context.fillRect(91, 50, 12, 32);
            context.beginPath();
            context.arc(64, 28, 23, 0, Math.PI * 2);
            context.fill();
            context.fillStyle = "#263144";
            if (direction !== 3) {
              const shift = direction === 1 ? -10 : direction === 2 ? 10 : 0;
              context.fillRect(48 + shift, 22, 12, 8);
              context.fillRect(68 + shift, 22, 12, 8);
              context.fillRect(60 + shift, 25, 8, 2);
              context.fillRect(55 + shift, 37, 18, 4);
            }
            // Native one-pixel detail distinguishes 128-pixel frames from enlarged 32-pixel art.
            context.fillStyle = "#fff";
            for (let x = 42; x < 88; x += 4) context.fillRect(x, 57, 1, 14);
            context.restore();
          }
        }
        return canvas.toDataURL("image/png");
      };
      const legacy = makeSheet(32),
        medium = avatar && avatarSize === 64 ? avatar : makeSheet(64),
        hd = avatar && avatarSize === 128 ? avatar : makeSheet(128);
      for (const [size, url] of [
        [32, legacy],
        [64, medium],
        [128, hd],
      ]) {
        const row = document.createElement("div");
        row.className = "row";
        document.querySelector("#previews").append(row);
        for (let direction = 0; direction < 4; direction++) {
          const item = document.createElement("div");
          item.className = "preview";
          item.textContent = `${size} px · ${["Face", "Gauche", "Droite", "Dos"][direction]}`;
          row.append(item);
          mount(WokaImage, {
            target: item,
            props: {
              selectedTextures: { woka: `test-${size}` },
              wokaData: {
                woka: {
                  collections: [
                    { name: "Test", textures: [{ id: `test-${size}`, url }] },
                  ],
                },
              },
              canvasSize: 128,
              direction,
            },
          });
        }
      }
      const runtime = await new Promise((resolve, reject) => {
        const timeout = setTimeout(
          () => reject(new Error("Phaser did not finish the resolution check")),
          20000,
        );
        class CheckScene extends Phaser.Scene {
          preload() {
            queueWokaTexture(this.load, "legacy", legacy);
          }
          create() {
            const run = async () => {
              this.game.markDirty = () => {};
              const scale = new WaScaleManager((650 * 180) / 4, 64);
              scale.setGame(this.game);
              const camera = this.cameras.main;
              const readZoom = () => ({
                width: this.game.canvas.width,
                height: this.game.canvas.height,
                zoom: camera.zoom,
              });
              scale.setZoomModifier(2, camera, true);
              const legacyAnimating = readZoom();
              scale.setZoomModifier(2, camera, false);
              const legacySettled = readZoom();
              const loader = new SuperLoaderPlugin(this);
              await loader.wokaSpritesheet("medium", medium);
              const nativeAfterLoad = readZoom();
              scale.setZoomModifier(2, camera, true);
              const nativeAnimating = readZoom();
              scale.setZoomModifier(2, camera, false);
              const nativeSettled = readZoom();
              camera.setZoom(1);
              scale.applyNewSize();
              const nativeNoCamera = readZoom();
              await loader.wokaSpritesheet("hd", hd);
              scale.setZoomModifier(2, camera, false);
              const hdSettled = readZoom();
              scale.setZoomModifier(0.5, camera, false);
              const values = [];
              for (const [key, size, x] of [
                ["legacy", 32, 65],
                ["medium", 64, 105],
                ["hd", 128, 145],
              ]) {
                const texture = this.textures.get(key);
                const sprite = createWokaSprite(this, key, 1);
                this.add.existing(sprite);
                const container = this.add.container(x, 90, [sprite]);
                container.setSize(16, 16);
                this.physics.add.existing(container);
                container.body.setSize(16, 16);
                container.body.setOffset(0, 8);
                for (const animation of getPlayerAnimations(key))
                  this.anims.create({
                    ...animation,
                    frames: this.anims.generateFrameNumbers(key, {
                      frames: animation.frames,
                    }),
                  });
                const frames = [];
                for (let frame = 0; frame < 12; frame++) {
                  sprite.setFrame(frame);
                  frames.push({
                    width: sprite.frame.width,
                    height: sprite.frame.height,
                    x: sprite.frame.cutX,
                    y: sprite.frame.cutY,
                    displayWidth: sprite.displayWidth,
                    displayHeight: sprite.displayHeight,
                  });
                }
                sprite.play(`${key}-down-walk`);
                sprite.anims.pause();
                const walkFrames = sprite.anims.currentAnim.frames.map(
                  (frame) => Number(frame.textureFrame),
                );
                const enlarged = createWokaSprite(this, key, 1);
                this.add.existing(enlarged);
                enlarged.setPosition(
                  size === 32 ? 260 : size === 64 ? 415 : 570,
                  90,
                );
                enlarged.setScale(enlarged.scaleX * 4);
                values.push({
                  key,
                  size,
                  frameCount: texture.frameTotal - 1,
                  frames,
                  walkFrames,
                  scale: sprite.scaleX,
                  bodyWidth: container.body.width,
                  bodyHeight: container.body.height,
                });
              }
              const lazy = await loader.wokaSpritesheet("lazy-hd", hd);
              const cached = await loader.wokaSpritesheet("lazy-hd", hd);
              clearTimeout(timeout);
              resolve({
                values,
                lazyFrameWidth: lazy.get(1).width,
                cachedSameTexture: cached === lazy,
                legacyAnimating,
                legacySettled,
                nativeAfterLoad,
                nativeAnimating,
                nativeSettled,
                nativeNoCamera,
                hdSettled,
              });
            };
            run().catch((error) => {
              clearTimeout(timeout);
              reject(error);
            });
          }
        }
        new Phaser.Game({
          type: renderer === "canvas" ? Phaser.CANVAS : Phaser.WEBGL,
          width: 650,
          height: 180,
          parent: "world",
          backgroundColor: "#203249",
          pixelArt: true,
          physics: { default: "arcade", arcade: { debug: false } },
          scene: CheckScene,
          audio: { noAudio: true },
          banner: false,
        });
      });
      // Wait for the actual Svelte canvases to decode and paint every direction.
      const hash = async (canvas) => {
        const bytes = canvas.getContext("2d").getImageData(0, 0, 128, 128).data;
        return [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))]
          .map((v) => v.toString(16).padStart(2, "0"))
          .join("");
      };
      const expectedHashes = [];
      for (const [size, url] of [
        [32, legacy],
        [64, medium],
        [128, hd],
      ]) {
        const image = new Image();
        image.src = url;
        await image.decode();
        for (let direction = 0; direction < 4; direction++) {
          const canvas = document.createElement("canvas");
          canvas.width = canvas.height = 128;
          const context = canvas.getContext("2d");
          context.imageSmoothingEnabled = false;
          context.drawImage(
            image,
            0,
            direction * size,
            size,
            size,
            0,
            0,
            128,
            128,
          );
          expectedHashes.push(await hash(canvas));
        }
      }
      let previewHashes;
      for (let attempt = 0; attempt < 100; attempt++) {
        await new Promise((resolve) => requestAnimationFrame(resolve));
        previewHashes = await Promise.all(
          [...document.querySelectorAll(".preview canvas")].map(hash),
        );
        if (
          previewHashes.length === 12 &&
          previewHashes.every((value, index) => value === expectedHashes[index])
        )
          break;
      }
      return { runtime, previewHashes, expectedHashes, hd, medium, legacy };
    },
    { renderer: process.env.WOKA_TEST_RENDERER || "webgl", avatar, avatarSize },
  );
  assert.deepEqual(errors, []);
  for (const {
    size,
    frameCount,
    frames,
    scale,
    walkFrames,
    bodyWidth,
    bodyHeight,
  } of result.runtime.values) {
    assert.equal(frameCount, 12);
    assert.equal(scale, 32 / size);
    assert.equal(bodyWidth, 16);
    assert.equal(bodyHeight, 16);
    assert.deepEqual(walkFrames, [0, 1, 2, 1]);
    frames.forEach((frame, index) => {
      assert.deepEqual(frame, {
        width: size,
        height: size,
        x: (index % 3) * size,
        y: Math.floor(index / 3) * size,
        displayWidth: 32,
        displayHeight: 32,
      });
    });
  }
  assert.equal(result.runtime.lazyFrameWidth, 128);
  assert.equal(result.runtime.cachedSameTexture, true);
  assert.ok(
    result.runtime.legacySettled.width < result.runtime.legacyAnimating.width,
  );
  assert.equal(result.runtime.legacySettled.zoom, 1);
  assert.deepEqual(
    result.runtime.nativeAfterLoad,
    result.runtime.nativeAnimating,
  );
  assert.deepEqual(
    result.runtime.nativeSettled,
    result.runtime.nativeAnimating,
  );
  assert.deepEqual(result.runtime.nativeNoCamera, result.runtime.nativeSettled);
  assert.deepEqual(result.runtime.hdSettled, result.runtime.nativeSettled);
  assert.equal(result.previewHashes.length, 12);
  assert.deepEqual(result.previewHashes, result.expectedHashes);
  await writeFile(
    path.join(output, "avatar-test-64.png"),
    Buffer.from(result.medium.split(",")[1], "base64"),
  );
  await writeFile(
    path.join(output, "avatar-test-128.png"),
    Buffer.from(result.hd.split(",")[1], "base64"),
  );
  await writeFile(
    path.join(output, "avatar-test-32.png"),
    Buffer.from(result.legacy.split(",")[1], "base64"),
  );
  await page.screenshot({
    path: path.join(output, "comparison.png"),
    fullPage: true,
  });
  delete result.hd;
  delete result.medium;
  delete result.legacy;
  await writeFile(
    path.join(output, "result.json"),
    JSON.stringify(result, null, 2),
  );
  console.log(
    `PASS: 32/64/128px frames; 32px world size; collision bodies; lazy/cache loading; 12 Svelte previews; native pixels preserved after zoom.\nArtifacts: ${output}`,
  );
} finally {
  await browser?.close();
  await server.close();
}
