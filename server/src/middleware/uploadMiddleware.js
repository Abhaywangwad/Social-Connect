import multer from 'multer';
import path from 'path';
import AppError from '../utils/AppError.js';

// Allowed MIME types and corresponding extensions
const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
]);

const ALLOWED_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp']);

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB per image
const MAX_FILE_COUNT = 10; // Max 10 images per post
const MAX_FIELDS = 20;
const MAX_FIELD_SIZE = 100 * 1024; // 100 KB max field value (e.g. caption)

/**
 * Configure Multer with in-memory storage.
 * Keeps uploaded file data in RAM as a Buffer, eliminating disk writes
 * and leaving no temporary files on the local filesystem.
 */
const storage = multer.memoryStorage();

/**
 * Filter uploaded files based on declared MIME type and extension.
 */
const fileFilter = (_req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();

  if (!ALLOWED_MIME_TYPES.has(file.mimetype) || !ALLOWED_EXTENSIONS.has(ext)) {
    return cb(
      AppError.badRequest(
        `Unsupported file type '${file.mimetype || ext}'. Allowed types are JPEG, PNG, and WebP.`,
        'UNSUPPORTED_FILE_TYPE'
      ),
      false
    );
  }

  cb(null, true);
};

// Base Multer instance for post media with strict multipart limits
const upload = multer({
  storage,
  limits: {
    fileSize: MAX_FILE_SIZE,
    files: MAX_FILE_COUNT,
    fields: MAX_FIELDS,
    fieldSize: MAX_FIELD_SIZE,
  },
  fileFilter,
});

/**
 * Validates that a buffer starts with authentic image magic numbers:
 * - JPEG: FF D8 FF
 * - PNG: 89 50 4E 47
 * - WebP: 52 49 46 46 (RIFF) ... 57 45 42 50 (WEBP)
 *
 * @param {Buffer} buffer
 * @returns {boolean} True if file signature matches an allowed image format
 */
export const isValidImageSignature = (buffer) => {
  if (!buffer || buffer.length < 12) return false;

  // JPEG magic bytes: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return true;
  }

  // PNG magic bytes: 89 50 4E 47
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  ) {
    return true;
  }

  // WebP magic bytes: RIFF (bytes 0-3) and WEBP (bytes 8-11)
  if (
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50
  ) {
    return true;
  }

  return false;
};

/**
 * Validates magic bytes for all files in req.file or req.files.
 */
const verifyUploadedFilesSignature = (req) => {
  const files = req.files || (req.file ? [req.file] : []);
  for (const file of files) {
    if (!file.buffer || !isValidImageSignature(file.buffer)) {
      throw AppError.badRequest(
        `Invalid or corrupted image format detected for file '${file.originalname}'. Content signature does not match JPEG, PNG, or WebP.`,
        'INVALID_FILE_SIGNATURE'
      );
    }
  }
};

/**
 * Route middleware for handling up to 10 image uploads under the 'media' field name.
 * Standardizes Multer errors and performs server-side file signature verification.
 */
export const uploadPostMedia = (req, res, next) => {
  const handler = upload.array('media', MAX_FILE_COUNT);

  handler(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return next(
          AppError.badRequest('File too large. Maximum allowed size is 10 MB per image.', 'FILE_TOO_LARGE')
        );
      }
      if (err.code === 'LIMIT_FILE_COUNT') {
        return next(
          AppError.badRequest('Too many files. A post cannot exceed 10 images.', 'TOO_MANY_FILES')
        );
      }
      if (err.code === 'LIMIT_UNEXPECTED_FILE') {
        return next(
          AppError.badRequest(`Unexpected upload field: '${err.field}'. Use 'media'.`, 'UNEXPECTED_FIELD')
        );
      }
      return next(AppError.badRequest(`File upload error: ${err.message}`, 'UPLOAD_ERROR'));
    }

    if (err) {
      return next(err);
    }

    try {
      verifyUploadedFilesSignature(req);
      next();
    } catch (signatureErr) {
      next(signatureErr);
    }
  });
};

/**
 * Route middleware for handling single image upload under the 'media' field name for Stories.
 * Standardizes Multer errors and performs server-side file signature verification.
 */
export const uploadStoryMedia = (req, res, next) => {
  const handler = upload.single('media');

  handler(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return next(
          AppError.badRequest('File too large. Maximum allowed size is 10 MB per image.', 'FILE_TOO_LARGE')
        );
      }
      if (err.code === 'LIMIT_UNEXPECTED_FILE') {
        return next(
          AppError.badRequest(`Unexpected upload field: '${err.field}'. Use 'media'.`, 'UNEXPECTED_FIELD')
        );
      }
      return next(AppError.badRequest(`File upload error: ${err.message}`, 'UPLOAD_ERROR'));
    }

    if (err) {
      return next(err);
    }

    try {
      verifyUploadedFilesSignature(req);
      next();
    } catch (signatureErr) {
      next(signatureErr);
    }
  });
};

export default uploadPostMedia;
