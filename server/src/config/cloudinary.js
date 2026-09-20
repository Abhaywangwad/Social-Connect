import { v2 as cloudinary } from 'cloudinary';
import config from './config.js';
import ApiError from '../utils/ApiError.js';

/**
 * Configure Cloudinary instance with server-side credentials.
 * Credentials are kept strictly on the backend and never exposed to clients.
 */
cloudinary.config({
  cloud_name: config.cloudinary.cloudName,
  api_key: config.cloudinary.apiKey,
  api_secret: config.cloudinary.apiSecret,
  secure: true,
});

/**
 * Validates that essential Cloudinary credentials are configured.
 * Fails clearly if any required environment variable is missing when media operations are performed.
 */
export const validateCloudinaryConfig = () => {
  const { cloudName, apiKey, apiSecret } = config.cloudinary;
  if (!cloudName || !apiKey || !apiSecret) {
    throw ApiError.internal(
      'Media storage service is not properly configured. Missing Cloudinary credentials.'
    );
  }
};

export default cloudinary;
