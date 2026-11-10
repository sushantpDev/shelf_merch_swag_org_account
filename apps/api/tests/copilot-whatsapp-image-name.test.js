import { describe, expect, it } from 'vitest';
import { isFileAllowed, DOCUMENT_TYPES } from '../src/middleware/upload.middleware.js';

describe('WhatsApp-style image names', () => {
  it('allows image MIME when path.extname is a timestamp fragment like .07', () => {
    expect(
      isFileAllowed(DOCUMENT_TYPES, {
        originalname: 'WhatsApp Image 2024-11-05 at 12.38.07',
        mimetype: 'image/jpeg',
      }),
    ).toBe(true);
  });

  it('still rejects non-image MIME with bogus extensions', () => {
    expect(
      isFileAllowed(DOCUMENT_TYPES, {
        originalname: 'notes.07',
        mimetype: 'text/plain',
      }),
    ).toBe(false);
  });

  it('allows WhatsApp names when Windows sends an empty MIME', () => {
    expect(
      isFileAllowed(DOCUMENT_TYPES, {
        originalname: 'WhatsApp Image 2024-11-05 at 12.38.07',
        mimetype: '',
      }),
    ).toBe(true);
  });
});
