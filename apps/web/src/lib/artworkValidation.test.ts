import { deflateSync } from "node:zlib";
import { describe, expect, it, vi, afterEach } from "vitest";
import {
  ARTWORK_MAX_BYTES,
  validateArtworkBytes,
} from "../../../api/src/utils/artworkValidation.js";
import { validateArtworkUpload } from "../../../api/src/middleware/artwork.middleware.js";
import { validateArtworkFile } from "./artworkValidation";
import {
  prepareArtworkUploadFile,
  uploadCollectionArtworkApi,
  uploadKitArtworkApi,
} from "@/services/mutations-api";

function chunk(type: string, data: Uint8Array) {
  const result = Buffer.alloc(data.length + 12);
  result.writeUInt32BE(data.length);
  result.write(type, 4);
  result.set(data, 8);
  let crc = 0xffffffff;
  for (const value of result.subarray(4, -4)) {
    crc ^= value;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  result.writeUInt32BE((crc ^ 0xffffffff) >>> 0, result.length - 4);
  return result;
}

function png(x: number | null = 11811, y = x, unit = 1) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(1, 0);
  header.writeUInt32BE(1, 4);
  header[8] = 8;
  header[9] = 6;
  const density = Buffer.alloc(9);
  density.writeUInt32BE(x ?? 0, 0);
  density.writeUInt32BE(y ?? 0, 4);
  density[8] = unit;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header),
    ...(x === null ? [] : [chunk("pHYs", density)]),
    chunk("IDAT", deflateSync(Buffer.from([0, 255, 0, 0, 255]))),
    chunk("IEND", new Uint8Array()),
  ]);
}

function file(bytes = png(), name = "artwork.png", type = "image/png") {
  return new File([new Uint8Array(bytes)], name, { type });
}

afterEach(() => vi.unstubAllGlobals());

describe("PNG artwork requirements shared by browser and API", () => {
  it.each([11811, 23622])(
    "accepts rounded 300 DPI and higher (%i pixels/metre)",
    async (density) => {
      const bytes = png(density);
      expect(validateArtworkBytes(bytes)).toMatchObject({ width: 1, height: 1 });
      await expect(validateArtworkFile(file(bytes))).resolves.toMatchObject({ width: 1 });
      expect(() =>
        validateArtworkUpload({ buffer: bytes, originalname: "art.png", mimetype: "image/png" }),
      ).not.toThrow();
    },
  );

  it.each([
    [png(3780), "300 DPI"],
    [png(11811, 11810), "300 DPI"],
    [png(11810, 11811), "300 DPI"],
    [png(null), "metadata is missing"],
    [png(11811, 11811, 0), "metadata is missing"],
    [Buffer.from("renamed JPEG data"), "valid PNG"],
    [png().subarray(0, -1), "damaged"],
  ])("rejects invalid artwork consistently", async (bytes, message) => {
    expect(() => validateArtworkBytes(bytes)).toThrow(message);
    await expect(validateArtworkFile(file(bytes))).rejects.toThrow(message);
    expect(() =>
      validateArtworkUpload({ buffer: bytes, originalname: "art.png", mimetype: "image/png" }),
    ).toThrow(message);
  });

  it("rejects damaged PNG checksums", () => {
    const bytes = png();
    bytes[bytes.length - 1] ^= 1;
    expect(() => validateArtworkBytes(bytes)).toThrow("damaged");
  });

  it("rejects oversized artwork before reading its bytes", async () => {
    await expect(
      validateArtworkFile(
        new File([new Uint8Array(ARTWORK_MAX_BYTES + 1)], "large.png", { type: "image/png" }),
      ),
    ).rejects.toThrow("5 MB");
  });

  it.each([
    ["art.jpg", "image/jpeg"],
    ["art.png", "image/jpeg"],
    ["art.svg", "image/svg+xml"],
  ])("rejects unsupported filenames and MIME types (%s)", async (name, mime) => {
    await expect(validateArtworkFile(file(png(), name, mime))).rejects.toThrow("PNG");
  });

  it("permits PNGs with uppercase extensions and generic browser MIME", async () => {
    await expect(
      validateArtworkFile(file(png(), "ART.PNG", "application/octet-stream")),
    ).resolves.toMatchObject({ width: 1 });
  });

  it("retains source pixels and DPI metadata when preparing artwork", async () => {
    const original = file();
    const prepared = await prepareArtworkUploadFile({ file: original });
    expect(prepared).toBe(original);
    expect(new Uint8Array(await prepared!.arrayBuffer())).toEqual(
      new Uint8Array(await original.arrayBuffer()),
    );
  });

  it("validates reused artwork fetched from history", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(new Uint8Array(png(null)), { headers: { "Content-Type": "image/png" } }),
        ),
    );
    await expect(
      prepareArtworkUploadFile({ preview: "/uploads/old.png", name: "Previous artwork" }),
    ).rejects.toThrow("metadata is missing");
  });

  it("blocks both upload services before a network request for invalid PNGs", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    await expect(uploadCollectionArtworkApi("collection", file(png(3780)))).rejects.toThrow(
      "300 DPI",
    );
    await expect(uploadKitArtworkApi("kit", file(png(null)))).rejects.toThrow(
      "metadata is missing",
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  it("returns structured API errors for missing or invalid artwork", () => {
    expect(() => validateArtworkUpload(undefined)).toThrow(
      expect.objectContaining({ status: 400, code: "FILE_REQUIRED" }),
    );
    expect(() =>
      validateArtworkUpload({ buffer: png(3780), originalname: "art.png", mimetype: "image/png" }),
    ).toThrow(expect.objectContaining({ status: 422, code: "INVALID_ARTWORK" }));
  });
});
