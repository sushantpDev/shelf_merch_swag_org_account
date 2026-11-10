export const ARTWORK_MAX_BYTES: number;
export const ARTWORK_ACCEPT: string;
export const ARTWORK_REQUIREMENTS: string;
export function validateArtworkBytes(bytes: Uint8Array): {
  width: number;
  height: number;
  dpiX: number;
  dpiY: number;
};
