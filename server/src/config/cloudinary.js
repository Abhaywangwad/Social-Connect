import { v2 as cloudinary } from 'cloudinary';

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Uploads an image (from multer, kept in memory) to Cloudinary
// and returns its public URL.
export const uploadImage = async (file) => {
  const dataUri = `data:${file.mimetype};base64,${file.buffer.toString('base64')}`;

  try {
    const result = await cloudinary.uploader.upload(dataUri, { folder: 'social-connect' });
    return result.secure_url;
  } catch (err) {
    // Cloudinary rejects with { error: { message } }, so turn it into a normal Error
    const reason = err?.error?.message || err?.message || 'unknown error';
    console.error('Cloudinary upload failed:', reason);
    const error = new Error('Image upload failed. Check your Cloudinary keys in server/.env');
    error.status = 502;
    throw error;
  }
};
