import { Readable } from 'stream';
import cloudinary, { validateCloudinaryConfig } from '../config/cloudinary.js';
import config from '../config/config.js';
import ApiError from '../utils/ApiError.js';

/**
 * ─── Media Service ─────────────────────────────────────────────────────────────
 *
 * Encapsulates all interactions with external media storage (Cloudinary).
 * Keeps controllers and post business logic decoupled from Cloudinary SDK details.
 */

// Allow hooking a mock or custom provider for deterministic unit/failure testing
let customUploader = null;
let customDeleter = null;

export const _setCustomMediaHandlers = (uploader, deleter) => {
  customUploader = uploader;
  customDeleter = deleter;
};

export const _resetCustomMediaHandlers = () => {
  customUploader = null;
  customDeleter = null;
};

/**
 * Uploads an in-memory image buffer to Cloudinary using stream upload.
 *
 * @param {Buffer} buffer File buffer from Multer memoryStorage
 * @param {Object} [options] Custom upload options
 * @returns {Promise<{ type: string, url: string, publicId: string, width: number, height: number }>}
 */
export const uploadImage = async (buffer, options = {}) => {
  if (customUploader) {
    return customUploader(buffer, options);
  }

  validateCloudinaryConfig();

  if (!buffer || !Buffer.isBuffer(buffer)) {
    throw ApiError.badRequest('Invalid file buffer provided for image upload');
  }

  const uploadOptions = {
    folder: options.folder || config.cloudinary.folder,
    resource_type: 'image',
    ...options,
  };

  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      uploadOptions,
      (error, result) => {
        if (error) {
          // Log safe error internally without exposing credentials to caller
          console.error('[MediaService] Cloudinary upload error:', error.message);
          return reject(
            ApiError.internal('Failed to upload image to media storage service')
          );
        }

        resolve({
          type: 'image',
          url: result.secure_url,
          publicId: result.public_id,
          width: result.width,
          height: result.height,
        });
      }
    );

    const readable = new Readable();
    readable.push(buffer);
    readable.push(null);
    readable.pipe(uploadStream);
  });
};

/**
 * Deletes an image from Cloudinary by its public_id.
 *
 * @param {string} publicId
 * @returns {Promise<{ result: string }>}
 */
export const deleteImage = async (publicId) => {
  if (customDeleter) {
    return customDeleter(publicId);
  }

  validateCloudinaryConfig();

  if (!publicId || typeof publicId !== 'string') {
    throw ApiError.badRequest('Valid publicId required for media deletion');
  }

  try {
    const result = await cloudinary.uploader.destroy(publicId, {
      resource_type: 'image',
    });
    return result;
  } catch (error) {
    console.error(`[MediaService] Cloudinary deletion error for publicId ${publicId}:`, error.message);
    throw ApiError.internal('Failed to delete asset from media storage');
  }
};

/**
 * Deletes multiple images by publicId (used during post deletion or upload rollback).
 * Uses Promise.allSettled to ensure that one failure doesn't halt other deletions.
 *
 * @param {string[]} publicIds
 * @returns {Promise<{ successful: string[], failed: string[] }>}
 */
export const deleteMultipleImages = async (publicIds) => {
  if (!Array.isArray(publicIds) || publicIds.length === 0) {
    return { successful: [], failed: [] };
  }

  const results = await Promise.allSettled(
    publicIds.map((id) => deleteImage(id))
  );

  const successful = [];
  const failed = [];

  results.forEach((res, index) => {
    const id = publicIds[index];
    if (res.status === 'fulfilled') {
      successful.push(id);
    } else {
      console.warn(`[MediaService] Failed to cleanup image asset: ${id}`, res.reason?.message);
      failed.push(id);
    }
  });

  return { successful, failed };
};

export default {
  uploadImage,
  deleteImage,
  deleteMultipleImages,
};
