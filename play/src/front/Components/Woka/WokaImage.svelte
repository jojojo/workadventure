<script lang="ts">
    import { onMount, onDestroy } from "svelte";
    import { getWokaFrameSize } from "../../Utils/WokaFrameSize";
    import type { WokaData, WokaTexture } from "./WokaTypes";

    interface Props {
        selectedTextures: Record<string, string>;
        wokaData?: WokaData | null;
        canvasSize?: number;
        direction?: number;
        getTextureUrl?: (url: string) => string;
        classList?: string;
    }

    let {
        selectedTextures,
        wokaData = null,
        canvasSize = 64,
        direction = 0,
        getTextureUrl = (url) => url,
        classList = "",
    }: Props = $props();

    const bodyPartOrder = ["body", "eyes", "hair", "clothes", "hat", "accessory", "woka"];

    let canvas: HTMLCanvasElement;
    let ctx: CanvasRenderingContext2D;
    let images: Record<string, HTMLImageElement> = {};
    let frame: number = 0;

    let raf: number;

    function findTextureUrl(bodyPart: string): string | null {
        const textureId = selectedTextures?.[bodyPart];
        if (!textureId || !wokaData?.[bodyPart]?.collections) return null;
        for (const collection of wokaData[bodyPart].collections) {
            const texture = collection.textures.find((t: WokaTexture) => t.id === textureId);
            if (texture) return getTextureUrl(texture.url);
        }
        return null;
    }

    function loadImages() {
        images = {};
        for (const part of bodyPartOrder) {
            const url = findTextureUrl(part);
            if (url) {
                const img = new window.Image();
                img.src = url;
                // Load image with CORS headers to populate the cache with CORS headers
                img.crossOrigin = "user-credentials";
                images[part] = img;
            }
        }
    }

    function draw() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        for (const part of bodyPartOrder) {
            const img = images[part];
            ctx.imageSmoothingEnabled = false;
            if (img && img.complete && img.naturalWidth > 0) {
                const size = getWokaFrameSize(img.naturalWidth, img.naturalHeight);
                ctx.drawImage(img, frame * size, direction * size, size, size, 0, 0, canvasSize, canvasSize);
            }
        }
    }

    function animate() {
        draw();
        raf = requestAnimationFrame(animate);
    }

    $effect(() => {
        if (selectedTextures) {
            loadImages();
        }
    });

    onMount(() => {
        const context = canvas.getContext("2d");
        if (!context) return;
        ctx = context;
        loadImages();
        animate();
    });
    onDestroy(() => {
        cancelAnimationFrame(raf);
    });
</script>

<canvas bind:this={canvas} width={canvasSize} height={canvasSize} style="image-rendering: pixelated;" class={classList}
></canvas>
