export const ARTWORK_MAX_BYTES = 5 * 1024 * 1024;
export const ARTWORK_ACCEPT = '.png,image/png';
export const ARTWORK_REQUIREMENTS = 'PNG only, at least 300 DPI on both axes, maximum 5 MB.';

const signature = [137, 80, 78, 71, 13, 10, 26, 10];

function invalid(message) {
  throw new Error(message);
}

/** Validate PNG structure/checksums and physical resolution without rewriting source pixels. */
export function validateArtworkBytes(bytes) {
  if (bytes.length > ARTWORK_MAX_BYTES) invalid('Maximum artwork file size is 5 MB');
  if (!signature.every((value, i) => bytes[i] === value)) invalid('Upload a valid PNG artwork file');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 8;
  let width = 0;
  let height = 0;
  let density = null;
  let hasData = false;
  let ended = false;
  while (offset + 12 <= bytes.length) {
    const length = view.getUint32(offset);
    const end = offset + 8 + length;
    if (end + 4 > bytes.length) invalid('The PNG artwork is incomplete or damaged');
    const type = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8));
    let crc = 0xffffffff;
    for (let i = offset + 4; i < end; i++) {
      crc ^= bytes[i];
      for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
    if (((crc ^ 0xffffffff) >>> 0) !== view.getUint32(end)) invalid('The PNG artwork is incomplete or damaged');
    const data = offset + 8;
    if (offset === 8 && type !== 'IHDR') invalid('Upload a valid PNG artwork file');
    if (type === 'IHDR') {
      if (width || length !== 13) invalid('Upload a valid PNG artwork file');
      width = view.getUint32(data);
      height = view.getUint32(data + 4);
      const depths = { 0: [1, 2, 4, 8, 16], 2: [8, 16], 3: [1, 2, 4, 8], 4: [8, 16], 6: [8, 16] };
      if (!width || !height || !depths[bytes[data + 9]]?.includes(bytes[data + 8]) ||
          bytes[data + 10] !== 0 || bytes[data + 11] !== 0 || bytes[data + 12] > 1) {
        invalid('Upload a valid PNG artwork file');
      }
    } else if (type === 'pHYs') {
      if (density || hasData || length !== 9) invalid('The PNG resolution metadata is invalid');
      density = { x: view.getUint32(data), y: view.getUint32(data + 4), unit: bytes[data + 8] };
    } else if (type === 'IDAT') {
      hasData ||= length > 0;
    } else if (type === 'IEND') {
      if (length !== 0 || end + 4 !== bytes.length) invalid('The PNG artwork is incomplete or damaged');
      ended = true;
      break;
    }
    offset = end + 4;
  }
  if (!width || !height || !hasData || !ended) invalid('The PNG artwork is incomplete or damaged');
  if (!density || density.unit !== 1 || !density.x || !density.y) {
    invalid('PNG DPI metadata is missing. Export your artwork as a PNG at 300 DPI or higher.');
  }
  // PNG stores integer pixels/metre: 11811 pixels/metre is the rounded encoding of 300 DPI.
  if (density.x < Math.round(300 / 0.0254) || density.y < Math.round(300 / 0.0254)) {
    invalid(`Artwork must be at least 300 DPI on both axes (this PNG is ${Math.round(density.x * 0.0254)} × ${Math.round(density.y * 0.0254)} DPI).`);
  }
  return { width, height, dpiX: density.x * 0.0254, dpiY: density.y * 0.0254 };
}
