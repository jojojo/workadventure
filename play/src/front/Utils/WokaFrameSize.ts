export const WOKA_DISPLAY_SIZE = 32;
export const HIGH_RESOLUTION_WOKA_KEY = "high-resolution-woka-loaded";
export const HIGH_RESOLUTION_WOKA_EVENT = "woka-high-resolution-loaded";

/** High-resolution avatars keep the existing three-column, four-direction layout. */
export function getWokaFrameSize(width: number, height: number): 32 | 64 | 128 {
    if (width === 192 && height === 256) return 64;
    return width === 384 && height === 512 ? 128 : 32;
}
