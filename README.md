# Social Connect

A simple Instagram-style social media app built with the MERN stack. Users can sign up, post text and photos, follow each other, like and comment on posts, and chat in real time.

## Features

- Sign up, log in and log out (JWT stored in an HttpOnly cookie, passwords hashed with bcrypt)
- User profiles: view any profile, edit your own name, bio and photo
- Create posts with text and an optional image (uploaded to Cloudinary)
- Feed of posts from people you follow, with "Load more" pagination
- Like / unlike posts and add comments
- Follow / unfollow users
- One-to-one real-time chat with Socket.IO
- Search users by username or name

## Tech Stack

| Part     | Technology                                       |
| -------- | ------------------------------------------------ |
| Frontend | React 19, React Router, Vite, plain CSS          |
| Backend  | Node.js, Express 5                               |
| Database | MongoDB with Mongoose                            |
| Auth     | JSON Web Token (jsonwebtoken), bcryptjs, cookies |
| Images   | Multer + Cloudinary                              |
| Realtime | Socket.IO                                        |

## Project Structure

```
Social-Connect/
├── package.json            # "npm run dev" starts server + client together
├── server/
│   ├── .env.example
│   └── src/
│       ├── server.js       # Express app, routes, error handler, starts server
│       ├── config/         # db.js (MongoDB), cloudinary.js (image upload)
│       ├── middleware/     # auth.js (checks JWT cookie), upload.js (multer)
│       ├── models/         # User, Post (with comments), Message
│       ├── controllers/    # the logic for each route
│       ├── routes/         # URL -> controller mapping
│       └── socket/         # socket.js (real-time chat)
└── client/
    ├── vite.config.js      # proxies /api and /socket.io to the server
    └── src/
        ├── main.jsx        # renders <App /> inside Router + AuthProvider
        ├── App.jsx         # page routes
        ├── api.js          # small fetch() helper
        ├── context/        # AuthContext (logged-in user)
        ├── components/     # Navbar, PostCard, CreatePost, Avatar
        └── pages/          # Login, Signup, Feed, Profile, Search, Messages
```

## How to Run

**You need:** Node.js 18+, MongoDB (local or a free MongoDB Atlas cluster) and a free Cloudinary account.

1. **Install dependencies** (from the project root):

   ```bash
   npm run install:all
   ```

2. **Set up environment variables:** copy `server/.env.example` to `server/.env` and fill in your values:

   ```
   PORT=5000
   MONGODB_URI=mongodb://localhost:27017/social-connect
   JWT_SECRET=any_long_random_string
   CLOUDINARY_CLOUD_NAME=...
   CLOUDINARY_API_KEY=...
   CLOUDINARY_API_SECRET=...
   ```

3. **Start the app:**

   ```bash
   npm run dev
   ```

   - Client: http://localhost:5173
   - API: http://localhost:5000/api

   You can also run them separately with `npm run server` and `npm run client`.

## API Overview

| Method | Endpoint                  | Description                         |
| ------ | ------------------------- | ----------------------------------- |
| POST   | `/api/auth/signup`        | Create account and log in           |
| POST   | `/api/auth/login`         | Log in                              |
| POST   | `/api/auth/logout`        | Log out                             |
| GET    | `/api/auth/me`            | Get the logged-in user              |
| GET    | `/api/users/search?q=`    | Search users                        |
| GET    | `/api/users/:username`    | Get a profile and its posts         |
| PUT    | `/api/users/me`           | Edit my profile (name, bio, avatar) |
| POST   | `/api/users/:id/follow`   | Follow a user                       |
| DELETE | `/api/users/:id/follow`   | Unfollow a user                     |
| GET    | `/api/posts/feed?page=1`  | Feed (people I follow + me)         |
| POST   | `/api/posts`              | Create a post (text + image)        |
| DELETE | `/api/posts/:id`          | Delete my post                      |
| PUT    | `/api/posts/:id/like`     | Like / unlike a post                |
| POST   | `/api/posts/:id/comments` | Add a comment                       |
| GET    | `/api/messages`           | My conversations                    |
| GET    | `/api/messages/:userId`   | Chat history with a user            |
| POST   | `/api/messages/:userId`   | Send a message                      |

All routes except signup, login and logout require you to be logged in.
