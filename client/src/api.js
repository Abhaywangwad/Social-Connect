// Small helper around fetch() for talking to our Express API.
// - Sends JSON (or FormData when uploading an image)
// - The login cookie is sent automatically by the browser
// - Throws an Error with the server's message if the request fails
export async function api(path, { method = 'GET', body } = {}) {
  const options = { method };

  if (body instanceof FormData) {
    options.body = body; // browser sets the multipart headers itself
  } else if (body) {
    options.headers = { 'Content-Type': 'application/json' };
    options.body = JSON.stringify(body);
  }

  const res = await fetch('/api' + path, options);
  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.message || 'Something went wrong');
  }
  return data;
}
