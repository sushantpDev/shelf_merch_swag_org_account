import { uploader } from './upload.middleware.js';
import { validateArtworkBytes } from '../utils/artworkValidation.js';
import { ApiError } from '../utils/errors.js';

export const artworkUpload = uploader({
  allow: { mimes: new Set(['image/png']), exts: new Set(['.png']) },
  maxSizeMb: 5,
});

export function validateArtworkUpload(file) {
  if (!file) throw new ApiError(400, 'No artwork file uploaded', 'FILE_REQUIRED');
  try {
    if (!/\.png$/i.test(file.originalname || '') ||
        !['image/png', '', 'application/octet-stream'].includes(file.mimetype || '')) {
      throw new Error('Upload a PNG artwork file');
    }
    validateArtworkBytes(file.buffer);
  } catch (error) {
    throw new ApiError(422, error.message, 'INVALID_ARTWORK');
  }
}
