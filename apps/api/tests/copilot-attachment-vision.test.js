import { describe, expect, it, vi } from 'vitest';

vi.mock('../src/services/storage.service.js', () => ({
  uploadFile: vi.fn(),
  readStoredFile: vi.fn(async () => {
    const { Readable } = await import('node:stream');
    return Readable.from([Buffer.from('abc')]);
  }),
}));

import { buildAnthropicImageBlocks } from '../src/modules/copilot/copilotAttachments.service.js';

describe('buildAnthropicImageBlocks', () => {
  it('builds base64 image blocks without exposing storage URLs', async () => {
    const blocks = await buildAnthropicImageBlocks([
      {
        kind: 'file',
        originalName: 'product.jpg',
        mimeType: 'image/jpeg',
        sizeBytes: 3,
        storageKey: 'tenant/attachment/x.jpg',
        storageDriver: 'local',
        fileUrl: '/uploads/secret/path.jpg',
      },
    ]);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].type).toBe('image');
    expect(blocks[0].source.type).toBe('base64');
    expect(blocks[0].source.media_type).toBe('image/jpeg');
    expect(JSON.stringify(blocks)).not.toMatch(/uploads|secret|http/i);
  });

  it('skips store-logo artwork tickets', async () => {
    const blocks = await buildAnthropicImageBlocks([
      {
        kind: 'artwork',
        originalName: 'logo.png',
        mimeType: 'image/png',
        sizeBytes: 3,
        storageKey: 'tenant/artwork/x.png',
        storageDriver: 'local',
      },
    ]);
    expect(blocks).toEqual([]);
  });
});