import multer from 'multer';

// Keep the uploaded file in memory (req.file.buffer) so we can send it
// straight to Cloudinary. Only images up to 5 MB are allowed.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      const err = new Error('Only image files are allowed');
      err.status = 400;
      cb(err);
    }
  },
});

export default upload;
