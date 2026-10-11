import { useState } from 'react';
import { api } from '../api.js';

export default function CreatePost({ onCreated }) {
  const [text, setText] = useState('');
  const [image, setImage] = useState(null); // the File the user picked
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!text.trim() && !image) {
      setError('Write something or add an image');
      return;
    }

    // FormData lets us send text and a file in the same request
    const formData = new FormData();
    formData.append('text', text);
    if (image) formData.append('image', image);

    setLoading(true);
    setError('');
    try {
      const data = await api('/posts', { method: 'POST', body: formData });
      onCreated(data.post);
      setText('');
      setImage(null);
      e.target.reset(); // clears the file input
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form className="card create-post" onSubmit={handleSubmit}>
      <textarea
        className="form-input"
        rows="3"
        placeholder="What's on your mind?"
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      {image && <img className="image-preview" src={URL.createObjectURL(image)} alt="Preview" />}
      {error && <p className="error-text">{error}</p>}
      <div className="create-post-actions">
        <input type="file" accept="image/*" onChange={(e) => setImage(e.target.files[0] || null)} />
        <button className="btn btn-primary" type="submit" disabled={loading}>
          {loading ? 'Posting...' : 'Post'}
        </button>
      </div>
    </form>
  );
}
