import mongoose from 'mongoose';

// Comments are stored inside the post they belong to
const commentSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    text: { type: String, required: true },
  },
  { timestamps: true }
);

const postSchema = new mongoose.Schema(
  {
    author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    text: { type: String, default: '' },
    image: { type: String, default: '' }, // Cloudinary image URL
    likes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }], // ids of users who liked
    comments: [commentSchema],
  },
  { timestamps: true }
);

const Post = mongoose.model('Post', postSchema);
export default Post;
