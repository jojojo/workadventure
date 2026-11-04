export const WOKA_DISPLAY_SIZE = 32;

/** High-resolution avatars keep the existing three-column, four-direction layout. */
export function getWokaFrameSize(width: number, height: number): 32 | 128 {
    return width === 384 && height === 512 ? 128 : 32;
}
