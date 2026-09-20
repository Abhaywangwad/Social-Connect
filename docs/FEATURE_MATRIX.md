# Feature Matrix — Social Connect

| Module | Feature | REST API Endpoint(s) | Socket.IO Event(s) | Frontend Component | Status |
|---|---|---|---|---|---|
| **Auth** | User Registration | `POST /api/auth/register` | — | `RegisterForm` | ✅ Complete |
| **Auth** | User Login | `POST /api/auth/login` | — | `LoginForm` | ✅ Complete |
| **Auth** | Token Refresh | `POST /api/auth/refresh` | — | `api.js` (Interceptors) | ✅ Complete |
| **Auth** | Current User Me | `GET /api/auth/me` | — | `AuthContext` | ✅ Complete |
| **Auth** | Logout (Single & All) | `POST /api/auth/logout`, `POST /api/auth/logout-all` | — | `Navbar`, `AuthContext` | ✅ Complete |
| **Auth** | Active Sessions | `GET /api/auth/sessions`, `DELETE /api/auth/sessions/:id` | — | `ProfileView` | ✅ Complete |
| **User** | Profile Read & Update | `GET /api/users/:username`, `PATCH /api/users/me` | — | `ProfileView`, `EditProfileModal` | ✅ Complete |
| **User** | User Search | `GET /api/users/search` | — | `SearchView` | ✅ Complete |
| **Social** | Follow / Unfollow | `POST /api/users/:username/follow`, `DELETE /api/users/:username/follow` | — | `ProfileView`, `SearchView` | ✅ Complete |
| **Social** | Follow Status | `GET /api/users/:username/follow-status` | — | `ProfileView` | ✅ Complete |
| **Social** | Followers & Following | `GET /api/users/:username/followers`, `GET /api/users/:username/following` | — | `ProfileView` | ✅ Complete |
| **Social** | User Blocking | `POST /api/users/:username/block`, `DELETE /api/users/:username/block` | — | `ProfileView` | ✅ Complete |
| **Posts** | Create Post | `POST /api/posts` | — | `CreatePostModal` | ✅ Complete |
| **Posts** | Feed (Cursor Paginated) | `GET /api/feed` | — | `FeedView` | ✅ Complete |
| **Posts** | Get & Edit Post | `GET /api/posts/:id`, `PATCH /api/posts/:id` | — | `PostCard` | ✅ Complete |
| **Posts** | Delete Post | `DELETE /api/posts/:id` | — | `PostCard` | ✅ Complete |
| **Posts** | Like / Unlike Post | `POST /api/posts/:id/like` | — | `PostCard` | ✅ Complete |
| **Posts** | Save / Unsave Post | `POST /api/posts/:id/save`, `DELETE /api/posts/:id/save` | — | `PostCard`, `SavedPostsView` | ✅ Complete |
| **Posts** | List Saved Posts | `GET /api/users/me/saved-posts` | — | `SavedPostsView` | ✅ Complete |
| **Comments**| List Comments | `GET /api/posts/:postId/comments` | — | `CommentSection` | ✅ Complete |
| **Comments**| Add Top-level Comment | `POST /api/posts/:postId/comments` | — | `CommentSection` | ✅ Complete |
| **Comments**| Reply to Comment | `POST /api/comments/:id/replies` | — | `CommentSection` | ✅ Complete |
| **Comments**| Edit & Delete Comment | `PATCH /api/comments/:id`, `DELETE /api/comments/:id` | — | `CommentSection` | ✅ Complete |
| **Stories** | Create Story | `POST /api/stories` | — | `StoryModal` | ✅ Complete |
| **Stories** | Active Stories Feed | `GET /api/stories` | — | `StoriesBar` | ✅ Complete |
| **Direct Msg**| Start Conversation | `POST /api/conversations` | `conversation:join` | `MessagesView` | ✅ Complete |
| **Direct Msg**| Real-Time Chat | `POST /api/conversations/:id/messages` | `message:send`, `message:new` | `MessagesView` | ✅ Complete |
| **Direct Msg**| Typing Indicators | — | `typing:start`, `typing:stop` | `MessagesView` | ✅ Complete |
| **Direct Msg**| Read Receipts | `PATCH /api/conversations/:id/read` | `conversation:read`, `message:read` | `MessagesView` | ✅ Complete |
| **Direct Msg**| User Presence | — | `presence:online`, `presence:offline` | `MessagesView`, `Navbar` | ✅ Complete |
| **Notifs**  | Unread Counter | `GET /api/notifications/unread-count` | — | `Navbar` (30s polling) | ✅ Complete |
| **Notifs**  | List Notifications | `GET /api/notifications` | — | `NotificationsView` | ✅ Complete |
| **Notifs**  | Mark Read (Single/All) | `PATCH /api/notifications/:id/read`, `PATCH /api/notifications/read-all` | — | `NotificationsView` | ✅ Complete |
| **Moderation**| Submit Abuse Report | `POST /api/reports` | — | `PostCard` (Report Modal) | ✅ Complete |
| **Admin**   | List Reports Queue | `GET /api/admin/reports` | — | `AdminDashboard` | ✅ Complete |
| **Admin**   | Review Report Status | `PATCH /api/admin/reports/:id/status` | — | `AdminDashboard` | ✅ Complete |
| **Admin**   | Moderate Post | `PATCH /api/admin/posts/:id/moderation` | — | `AdminDashboard` | ✅ Complete |
| **Admin**   | Moderate Comment | `PATCH /api/admin/comments/:id/moderation` | — | `AdminDashboard` | ✅ Complete |
| **Admin**   | Moderate User | `PATCH /api/admin/users/:id/status` | — | `AdminDashboard` | ✅ Complete |
