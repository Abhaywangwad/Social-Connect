import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  uploadImage,
  deleteImage,
  _setCustomMediaHandlers,
  _resetCustomMediaHandlers,
} from '../../src/services/mediaService.js';
import { VALID_JPEG_BUFFER } from '../fixtures/dummyImages.js';

describe('Unit: Media Service Storage Abstraction', () => {
  beforeEach(() => {
    _resetCustomMediaHandlers();
  });

  afterEach(() => {
    _resetCustomMediaHandlers();
  });

  it('rejects upload when buffer is null, undefined, or not a buffer', async () => {
    await expect(uploadImage(null)).rejects.toThrow(/invalid file buffer/i);
    await expect(uploadImage('not-a-buffer')).rejects.toThrow(/invalid file buffer/i);
  });

  it('routes to custom uploader hook when configured', async () => {
    let customCalled = false;
    _setCustomMediaHandlers(
      async (buf, opts) => {
        customCalled = true;
        return {
          type: 'image',
          url: 'https://cdn.custom.test/img1.jpg',
          publicId: 'custom_img1',
          width: 800,
          height: 600,
        };
      },
      async (publicId) => ({ result: 'ok' })
    );

    const result = await uploadImage(VALID_JPEG_BUFFER);
    expect(customCalled).toBe(true);
    expect(result.url).toBe('https://cdn.custom.test/img1.jpg');
    expect(result.publicId).toBe('custom_img1');
  });

  it('routes to custom deleter hook when configured', async () => {
    let deletedId = null;
    _setCustomMediaHandlers(
      null,
      async (publicId) => {
        deletedId = publicId;
        return { result: 'ok' };
      }
    );

    const result = await deleteImage('test_public_id_to_delete');
    expect(deletedId).toBe('test_public_id_to_delete');
    expect(result.result).toBe('ok');
  });

  it('resets custom handlers cleanly', async () => {
    _setCustomMediaHandlers(
      async () => ({ url: 'mock' }),
      async () => ({ result: 'mock' })
    );
    _resetCustomMediaHandlers();

    // Now it should attempt normal validation
    await expect(uploadImage(null)).rejects.toThrow(/invalid file buffer/i);
  });
});
