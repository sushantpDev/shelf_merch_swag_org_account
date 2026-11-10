import {
  ARTWORK_MAX_BYTES,
  validateArtworkBytes,
} from "../../../api/src/utils/artworkValidation.js";

export { ARTWORK_ACCEPT, ARTWORK_REQUIREMENTS } from "../../../api/src/utils/artworkValidation.js";

export async function validateArtworkFile(file: File) {
  if (
    !/\.png$/i.test(file.name) ||
    (file.type && file.type !== "image/png" && file.type !== "application/octet-stream")
  ) {
    throw new Error("Upload a PNG artwork file");
  }
  if (file.size > ARTWORK_MAX_BYTES) throw new Error("Maximum artwork file size is 5 MB");
  return validateArtworkBytes(new Uint8Array(await file.arrayBuffer()));
}

export async function readArtworkFile(file: File) {
  await validateArtworkFile(file);
  const preview = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Could not read artwork. Please try again."));
    reader.readAsDataURL(file);
  });
  return { name: file.name, preview, file };
}
