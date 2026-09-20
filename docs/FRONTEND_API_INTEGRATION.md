# Frontend API Integration Map

## Overview
This document maps all frontend components, views, and client actions in **Social Connect** to their corresponding authoritative backend REST endpoints and Socket.IO real-time events.

---

## 1. Authentication & Session Management

| Frontend Feature | Backend API Route | HTTP Method | Auth Level | Request Body / Params | Expected Response Data |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **User Registration** | `/api/auth/register` | `POST` | Public | `{ username, email, password, fullName }` | `{ success: true, message, data: { user } }` |
| **User Login** | `/api/auth/login` | `POST` | Public | `{ identifier, password }` | `{ success: true, data: { user, accessToken } }` + `HttpOnly` cookie |
| **Token Refresh** | `/api/auth/refresh` | `POST` | Public (Cookie) | Cookie: `refreshToken` | `{ success: true, data: { accessToken } }` |
| **Current User Identity** | `/api/auth/me` | `GET` | User (Bearer) | None | `{ success: true, data: { user } }` |
| **User Logout** | `/api/auth/logout` | `POST` | User (Bearer) | None | `{ success: true, message }` (clears cookie) |
| **Logout All Devices** | `/api/auth/logout-all` | `POST` | User (Bearer) | None | `{ success: true, message }` |
| **Active Sessions** | `/api/auth/sessions` | `GET` | User (Bearer) | None | `{ success: true, data: { sessions } }` |
| **Revoke Specific Session** | `/api/auth/sessions/:sessionId`| `DELETE` | User (Bearer) | `params: { sessionId }` | `{ success: true, message }` |
| **Change Password** | `/api/auth/change-password` | `PATCH` | User (Bearer) | `{ currentPassword, newPassword }` | `{ success: true, message }` |

---

## 2. Profiles, Social Graph & Blocking

| Frontend Feature | Backend API Route | HTTP Method | Auth Level | Request Body / Params | Expected Response Data |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Get My Profile** | `/api/users/me` | `GET` | User (Bearer) | None | `{ success: true, data: { user } }` |
| **Update My Profile** | `/api/users/me` | `PATCH` | User (Bearer) | `{ fullName, bio, profilePicture, isPrivate }` | `{ success: true, data: { user } }` |
| **Get Public User Profile** | `/api/users/:username` | `GET` | Optional Auth | `params: { username }` | `{ success: true, data: { user } }` |
| **User Profile Posts Grid** | `/api/users/:username/posts` | `GET` | Optional Auth | `params: { username }`, query: cursor/limit | `{ success: true, data: { posts, nextCursor } }` |
| **Follow User** | `/api/users/:username/follow` | `POST` | User (Bearer) | `params: { username }` | `{ success: true, data: { status } }` |
| **Unfollow User** | `/api/users/:username/follow` | `DELETE` | User (Bearer) | `params: { username }` | `{ success: true, message }` |
| **Get Follow Status** | `/api/users/:username/follow-status` | `GET` | User (Bearer) | `params: { username }` | `{ success: true, data: { isFollowing, isPending } }` |
| **Get Followers List** | `/api/users/:username/followers` | `GET` | Public | `params: { username }`, query: page/limit | `{ success: true, data: { followers, pagination } }` |
| **Get Following List** | `/api/users/:username/following` | `GET` | Public | `params: { username }`, query: page/limit | `{ success: true, data: { following, pagination } }` |
| **User Search** | `/api/users/search` | `GET` | User (Bearer) | query: `q, cursor, limit` | `{ success: true, data: { users, nextCursor } }` |
| **Block User** | `/api/users/:username/block` | `POST` | User (Bearer) | `params: { username }` | `{ success: true, message }` |
| **Unblock User** | `/api/users/:username/block` | `DELETE` | User (Bearer) | `params: { username }` | `{ success: true, message }` |
| **Get Block Status** | `/api/users/:username/block-status` | `GET` | User (Bearer) | `params: { username }` | `{ success: true, data: { isBlocked } }` |
| **Get Blocked Users List** | `/api/users/me/blocked` | `GET` | User (Bearer) | None | `{ success: true, data: { blockedUsers } }` |

---

## 3. Feed, Posts, Likes & Comments

| Frontend Feature | Backend API Route | HTTP Method | Auth Level | Request Body / Params | Expected Response Data |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Home Activity Feed** | `/api/feed` | `GET` | User (Bearer) | query: `cursor, limit` | `{ success: true, data: { posts, nextCursor, hasMore } }` |
| **Explore / Public Posts** | `/api/posts` | `GET` | Public | query: `page, limit` | `{ success: true, data: { posts, pagination } }` |
| **Create Post** | `/api/posts` | `POST` | User (Bearer) | `FormData`: `caption, media (file), location` | `{ success: true, data: { post } }` |
| **Get Post Details** | `/api/posts/:id` | `GET` | Optional Auth | `params: { id }` | `{ success: true, data: { post } }` |
| **Edit Post** | `/api/posts/:id` | `PATCH` | User (Owner) | `params: { id }`, `{ caption, location }` | `{ success: true, data: { post } }` |
| **Delete Post** | `/api/posts/:id` | `DELETE` | User (Owner) | `params: { id }` | `{ success: true, message }` |
| **Toggle Post Like** | `/api/posts/:id/like` | `POST` | User (Bearer) | `params: { id }` | `{ success: true, data: { isLiked, likesCount } }` |
| **Get Post Comments** | `/api/posts/:postId/comments`| `GET` | Public | `params: { postId }`, query: page/limit | `{ success: true, data: { comments, pagination } }` |
| **Create Comment** | `/api/posts/:postId/comments`| `POST` | User (Bearer) | `params: { postId }`, `{ content }` | `{ success: true, data: { comment } }` |
| **Get Comment Replies** | `/api/comments/:commentId/replies` | `GET` | Public | `params: { commentId }`, query: page/limit | `{ success: true, data: { replies, pagination } }` |
| **Create Reply** | `/api/comments/:commentId/replies` | `POST` | User (Bearer) | `params: { commentId }`, `{ content }` | `{ success: true, data: { reply } }` |
| **Edit Comment** | `/api/comments/:commentId` | `PATCH` | User (Author) | `params: { commentId }`, `{ content }` | `{ success: true, data: { comment } }` |
| **Delete Comment** | `/api/comments/:commentId` | `DELETE` | User (Author/Owner)| `params: { commentId }` | `{ success: true, message }` |

---

## 4. Bookmarks (Saved Posts)

| Frontend Feature | Backend API Route | HTTP Method | Auth Level | Request Body / Params | Expected Response Data |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Save Post** | `/api/posts/:postId/save` | `POST` | User (Bearer) | `params: { postId }` | `{ success: true, message }` |
| **Unsave Post** | `/api/posts/:postId/save` | `DELETE` | User (Bearer) | `params: { postId }` | `{ success: true, message }` |
| **Check Save Status** | `/api/posts/:postId/save-status` | `GET` | User (Bearer) | `params: { postId }` | `{ success: true, data: { isSaved } }` |
| **List Saved Posts** | `/api/users/me/saved-posts` | `GET` | User (Bearer) | query: `page, limit` | `{ success: true, data: { savedPosts, pagination } }` |

---

## 5. Ephemeral Stories

| Frontend Feature | Backend API Route | HTTP Method | Auth Level | Request Body / Params | Expected Response Data |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Create Story** | `/api/stories` | `POST` | User (Bearer) | `FormData`: `media (file), caption` | `{ success: true, data: { story } }` |
| **Get Active Stories Feed**| `/api/stories` | `GET` | User (Bearer) | None | `{ success: true, data: { stories } }` |
| **Get Story By ID** | `/api/stories/:storyId` | `GET` | User (Bearer) | `params: { storyId }` | `{ success: true, data: { story } }` |
| **Delete Story** | `/api/stories/:storyId` | `DELETE` | User (Author) | `params: { storyId }` | `{ success: true, message }` |

---

## 6. Notifications

| Frontend Feature | Backend API Route | HTTP Method | Auth Level | Request Body / Params | Expected Response Data |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Get Unread Count** | `/api/notifications/unread-count` | `GET` | User (Bearer) | None | `{ success: true, data: { unreadCount } }` |
| **List Notifications** | `/api/notifications` | `GET` | User (Bearer) | query: `page, limit, unreadOnly` | `{ success: true, data: { notifications, pagination } }` |
| **Mark Notification Read** | `/api/notifications/:notificationId/read` | `PATCH` | User (Bearer) | `params: { notificationId }` | `{ success: true, data: { notification } }` |
| **Mark All Notifications Read** | `/api/notifications/read-all` | `PATCH` | User (Bearer) | None | `{ success: true, message }` |

---

## 7. Direct Messaging (REST)

| Frontend Feature | Backend API Route | HTTP Method | Auth Level | Request Body / Params | Expected Response Data |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Create/Get Conversation**| `/api/conversations` | `POST` | User (Bearer) | `{ recipientId }` | `{ success: true, data: { conversation } }` |
| **List User Conversations**| `/api/conversations` | `GET` | User (Bearer) | query: `page, limit` | `{ success: true, data: { conversations, pagination } }` |
| **Get Conversation Details**| `/api/conversations/:conversationId` | `GET` | User (Participant)| `params: { conversationId }` | `{ success: true, data: { conversation } }` |
| **Send Message (REST)** | `/api/conversations/:conversationId/messages` | `POST` | User (Participant)| `params: { conversationId }`, `{ content }` | `{ success: true, data: { message } }` |
| **List Messages** | `/api/conversations/:conversationId/messages` | `GET` | User (Participant)| `params: { conversationId }`, query: cursor/limit | `{ success: true, data: { messages, nextCursor } }` |
| **Mark Conversation Read** | `/api/conversations/:conversationId/read` | `PATCH` | User (Participant)| `params: { conversationId }` | `{ success: true, data: { conversationId, readAt } }` |

---

## 8. Real-Time Socket.IO Integration

| Client Socket Action | Socket Event Emitted | Direction | Payload | Server Response / Broadcast |
| :--- | :--- | :--- | :--- | :--- |
| **Handshake Auth** | `connect` | Client → Server | `auth: { token: accessToken }` | Establishes connection or emits `connect_error` |
| **Join Conversation** | `conversation:join` | Client → Server | `{ conversationId }` | Ack: `{ success: true }` |
| **Leave Conversation** | `conversation:leave` | Client → Server | `{ conversationId }` | Ack: `{ success: true }` |
| **Send Live Message** | `message:send` | Client → Server | `{ conversationId, content, clientMessageId }` | Ack: `{ success: true, message }`<br>Broadcasts `message:new` to room<br>Broadcasts `conversation:updated` to users |
| **Receive Live Message**| `message:new` | Server → Client | None (Listener) | Received in conversation room `{ ...message }` |
| **Update Conversation** | `conversation:updated` | Server → Client | None (Listener) | `{ conversationId, lastMessage, lastMessageAt }` |
| **Send Read Receipt** | `conversation:read` | Client → Server | `{ conversationId }` | Ack: `{ success: true, readAt }`<br>Emits `message:read` to peer |
| **Receive Read Receipt**| `message:read` | Server → Client | None (Listener) | `{ conversationId, userId, readAt }` |
| **Start Typing** | `typing:start` | Client → Server | `{ conversationId }` | Broadcasts `typing:start` to peer |
| **Stop Typing** | `typing:stop` | Client → Server | `{ conversationId }` | Broadcasts `typing:stop` to peer |
| **Presence Online** | `presence:online` | Server → Client | None (Listener) | `{ userId }` |
| **Presence Offline** | `presence:offline` | Server → Client | None (Listener) | `{ userId }` |

---

## 9. Moderation & Reporting

| Frontend Feature | Backend API Route | HTTP Method | Auth Level | Request Body / Params | Expected Response Data |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Submit Report** | `/api/reports` | `POST` | User (Bearer) | `{ targetType, targetId, reason, description }` | `{ success: true, data: { report } }` |
| **Admin List Reports** | `/api/admin/reports` | `GET` | Admin (Bearer) | query: `status, targetType, page, limit` | `{ success: true, data: { reports, pagination } }` |
| **Admin Update Report**| `/api/admin/reports/:reportId/status` | `PATCH` | Admin (Bearer) | `params: { reportId }`, `{ status, moderationNote }` | `{ success: true, data: { report } }` |
| **Admin Moderate User**| `/api/admin/users/:userId/status` | `PATCH` | Admin (Bearer) | `params: { userId }`, `{ status: 'ACTIVE'/'SUSPENDED', reason }` | `{ success: true, data: { user } }` |
| **Admin Moderate Post**| `/api/admin/posts/:postId/moderation` | `PATCH` | Admin (Bearer) | `params: { postId }`, `{ status: 'ACTIVE'/'HIDDEN'/'REMOVED', reason }`| `{ success: true, data: { post } }` |
