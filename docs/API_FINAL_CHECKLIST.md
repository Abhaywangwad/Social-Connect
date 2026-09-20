# Final API Contract & Architecture Checklist

## Audit Summary
This audit validates all 73 REST API endpoints implemented across the Social Connect Express router against `docs/openapi.yaml`, controller authorization guards, input validation schemas, status codes, and Socket.IO real-time event definitions.

---

## 1. API Verification Matrix

| Area | Route & Method | Auth Level | Request Schema / Validation | Status Codes | Pagination Type | Verified? |
| :--- | :--- | :--- | :--- | :--- | :--- | :---: |
| **Health** | `GET /api/health` | Public | None | `200` | N/A | [x] |
| **Health** | `GET /api/health/ready` | Public | None | `200`, `503` | N/A | [x] |
| **Health** | `GET /api/health/live` | Public | None | `200` | N/A | [x] |
| **Health** | `GET /api/health/metrics` | Public / Secret Header | Optional Secret Header | `200`, `401` | N/A | [x] |
| **Auth** | `POST /api/auth/register` | Public | `registerSchema` (username, email, password, fullName) | `201`, `400`, `409` | N/A | [x] |
| **Auth** | `POST /api/auth/login` | Public | `loginSchema` (emailOrUsername, password) | `200`, `400`, `401`, `403` | N/A | [x] |
| **Auth** | `POST /api/auth/refresh` | Public (Cookie / Header) | Cookie or `x-refresh-token` | `200`, `401` | N/A | [x] |
| **Auth** | `POST /api/auth/logout` | Protected (JWT) | None | `200`, `401` | N/A | [x] |
| **Auth** | `POST /api/auth/logout-all` | Protected (JWT) | None | `200`, `401` | N/A | [x] |
| **Auth** | `GET /api/auth/sessions` | Protected (JWT) | None | `200`, `401` | N/A | [x] |
| **Auth** | `DELETE /api/auth/sessions/:sessionId` | Protected (JWT) | `sessionIdParamSchema` | `200`, `400`, `401`, `403`, `404` | N/A | [x] |
| **Auth** | `PATCH /api/auth/change-password` | Protected (JWT) | `changePasswordSchema` | `200`, `400`, `401` | N/A | [x] |
| **Auth** | `POST /api/auth/forgot-password` | Public | `forgotPasswordSchema` | `200`, `400` | N/A | [x] |
| **Auth** | `POST /api/auth/reset-password` | Public | `resetPasswordSchema` | `200`, `400`, `404` | N/A | [x] |
| **Auth** | `POST /api/auth/verify-email` | Public | `verifyEmailSchema` | `200`, `400`, `404` | N/A | [x] |
| **Auth** | `POST /api/auth/resend-verification` | Public | `resendVerificationSchema` | `200`, `400` | N/A | [x] |
| **Auth** | `GET /api/auth/me` | Protected (JWT) | None | `200`, `401` | N/A | [x] |
| **Users** | `GET /api/users/test` | Public | None | `200` | N/A | [x] |
| **Users** | `GET /api/users/search` | Protected (JWT) | `userSearchQuerySchema` (`q`, `page`, `limit`) | `200`, `400`, `401`, `429` | Offset / Page | [x] |
| **Users** | `GET /api/users/me` | Protected (JWT) | None | `200`, `401` | N/A | [x] |
| **Users** | `PATCH /api/users/me` | Protected (JWT) | `updateProfileSchema` | `200`, `400`, `401` | N/A | [x] |
| **Users** | `GET /api/users/me/blocked` | Protected (JWT) | `paginationQuerySchema` | `200`, `401` | Offset / Page | [x] |
| **Users** | `GET /api/users/:username` | Optional Auth | `usernameParamSchema` | `200`, `404` | N/A | [x] |
| **Users** | `GET /api/users/:username/posts` | Optional Auth | `usernameParamSchema`, `page`, `limit` | `200`, `404` | Offset / Page | [x] |
| **Blocks** | `POST /api/users/:username/block` | Protected (JWT) | `usernameParamSchema` | `200`, `400`, `401`, `404`, `409` | N/A | [x] |
| **Blocks** | `DELETE /api/users/:username/block` | Protected (JWT) | `usernameParamSchema` | `200`, `400`, `401`, `404` | N/A | [x] |
| **Blocks** | `GET /api/users/:username/block-status` | Protected (JWT) | `usernameParamSchema` | `200`, `400`, `401`, `404` | N/A | [x] |
| **Follows** | `POST /api/users/:username/follow` | Protected (JWT) | `followUsernameParamSchema` | `200`, `400`, `401`, `404`, `409` | N/A | [x] |
| **Follows** | `DELETE /api/users/:username/follow` | Protected (JWT) | `followUsernameParamSchema` | `200`, `400`, `401`, `404` | N/A | [x] |
| **Follows** | `GET /api/users/:username/follow-status` | Protected (JWT) | `followUsernameParamSchema` | `200`, `400`, `401`, `404` | N/A | [x] |
| **Follows** | `GET /api/users/:username/followers` | Public | `followUsernameParamSchema`, `followQuerySchema` | `200`, `400`, `404` | Offset / Page | [x] |
| **Follows** | `GET /api/users/:username/following` | Public | `followUsernameParamSchema`, `followQuerySchema` | `200`, `400`, `404` | Offset / Page | [x] |
| **Posts** | `POST /api/posts` | Protected (JWT) | Multer + Content Rules (`caption` or `media`) | `201`, `400`, `401`, `413` | N/A | [x] |
| **Posts** | `GET /api/posts` | Public | `page`, `limit` | `200` | Offset / Page | [x] |
| **Posts** | `GET /api/posts/:postId` | Optional Auth | `postIdParamSchema` | `200`, `400`, `404` | N/A | [x] |
| **Posts** | `PATCH /api/posts/:postId` | Protected (JWT Owner) | `updatePostSchema` (`caption`, `location`) | `200`, `400`, `401`, `403`, `404` | N/A | [x] |
| **Posts** | `DELETE /api/posts/:postId` | Protected (JWT Owner) | `postIdParamSchema` | `200`, `401`, `403`, `404` | N/A | [x] |
| **Posts** | `POST /api/posts/:postId/like` | Protected (JWT) | `postIdParamSchema` | `200`, `400`, `401`, `403`, `404` | N/A | [x] |
| **Saves** | `POST /api/posts/:postId/save` | Protected (JWT) | `savePostParamsSchema` | `200`, `400`, `401`, `404`, `409` | N/A | [x] |
| **Saves** | `DELETE /api/posts/:postId/save` | Protected (JWT) | `savePostParamsSchema` | `200`, `400`, `401` | N/A | [x] |
| **Saves** | `GET /api/posts/:postId/save-status` | Protected (JWT) | `savePostParamsSchema` | `200`, `400`, `401` | N/A | [x] |
| **Saves** | `GET /api/users/me/saved-posts` | Protected (JWT) | `saveQuerySchema` (`page`, `limit`) | `200`, `400`, `401` | Offset / Page | [x] |
| **Comments** | `POST /api/posts/:postId/comments` | Protected (JWT) | `createCommentSchema` (`content`) | `201`, `400`, `401`, `403`, `404` | N/A | [x] |
| **Comments** | `GET /api/posts/:postId/comments` | Public | `commentQuerySchema` (`page`, `limit`) | `200`, `400`, `404` | Offset / Page | [x] |
| **Comments** | `POST /api/comments/:commentId/replies` | Protected (JWT) | `createCommentSchema` (`content`) | `201`, `400`, `401`, `403`, `404` | N/A | [x] |
| **Comments** | `GET /api/comments/:commentId/replies` | Public | `commentQuerySchema` (`page`, `limit`) | `200`, `400`, `404` | Offset / Page | [x] |
| **Comments** | `PATCH /api/comments/:commentId` | Protected (JWT Author) | `updateCommentSchema` (`content`) | `200`, `400`, `401`, `403`, `404` | N/A | [x] |
| **Comments** | `DELETE /api/comments/:commentId` | Protected (Author/Post Owner) | `commentIdParamSchema` | `200`, `400`, `401`, `403`, `404` | N/A | [x] |
| **Feed** | `GET /api/feed` | Protected (JWT) | `cursor`, `limit` (max 50) | `200`, `400`, `401` | **Compound Cursor** | [x] |
| **Notifications** | `GET /api/notifications` | Protected (JWT) | `page`, `limit` | `200`, `400`, `401` | Offset / Page | [x] |
| **Notifications** | `GET /api/notifications/unread-count` | Protected (JWT) | None | `200`, `401` | N/A | [x] |
| **Notifications** | `PATCH /api/notifications/read-all` | Protected (JWT) | None | `200`, `401` | N/A | [x] |
| **Notifications** | `PATCH /api/notifications/:id/read` | Protected (JWT Recipient) | `notificationIdParamSchema` | `200`, `400`, `401`, `403`, `404` | N/A | [x] |
| **Stories** | `POST /api/stories` | Protected (JWT) | Multer image + `caption` (max 500) | `201`, `400`, `401` | N/A | [x] |
| **Stories** | `GET /api/stories` | Protected (JWT) | `cursor`, `limit` | `200`, `400`, `401` | **Compound Cursor** | [x] |
| **Stories** | `GET /api/stories/:id` | Protected (JWT Follower) | `storyIdParamSchema` | `200`, `400`, `401`, `404` | N/A | [x] |
| **Stories** | `DELETE /api/stories/:id` | Protected (JWT Author) | `storyIdParamSchema` | `200`, `400`, `401`, `403`, `404` | N/A | [x] |
| **Conversations** | `POST /api/conversations` | Protected (JWT) | `createConversationSchema` (`targetUserId`) | `200`, `400`, `401`, `403`, `404` | N/A | [x] |
| **Conversations** | `GET /api/conversations` | Protected (JWT) | `page`, `limit` | `200`, `400`, `401` | Offset / Page | [x] |
| **Conversations** | `GET /api/conversations/:id` | Protected (JWT Participant) | `conversationIdParamSchema` | `200`, `400`, `401`, `403`, `404` | N/A | [x] |
| **Conversations** | `PATCH /api/conversations/:id/read` | Protected (JWT Participant) | `conversationIdParamSchema` | `200`, `400`, `401`, `403`, `404` | N/A | [x] |
| **Conversations** | `POST /api/conversations/:id/messages` | Protected (JWT Participant) | `sendMessageSchema` (`content`, `clientMessageId`) | `201`, `400`, `401`, `403`, `404` | N/A | [x] |
| **Conversations** | `GET /api/conversations/:id/messages` | Protected (JWT Participant) | `before`, `limit` | `200`, `400`, `401`, `403`, `404` | **Backward Cursor** | [x] |
| **Reports** | `POST /api/reports` | Protected (JWT) | `createReportSchema` | `201`, `400`, `401`, `409` | N/A | [x] |
| **Admin** | `GET /api/admin/reports` | Protected (ADMIN) | `status`, `targetType`, `reason`, `page`, `limit` | `200`, `401`, `403` | Offset / Page | [x] |
| **Admin** | `GET /api/admin/reports/:reportId` | Protected (ADMIN) | `reportIdParamSchema` | `200`, `401`, `403`, `404` | N/A | [x] |
| **Admin** | `PATCH /api/admin/reports/:reportId/status` | Protected (ADMIN) | `updateReportStatusSchema` | `200`, `400`, `401`, `403`, `404` | N/A | [x] |
| **Admin** | `GET /api/admin/users` | Protected (ADMIN) | `q`, `accountStatus`, `role`, `page`, `limit` | `200`, `401`, `403` | Offset / Page | [x] |
| **Admin** | `PATCH /api/admin/users/:userId/status` | Protected (ADMIN) | `updateUserStatusSchema` | `200`, `400`, `401`, `403`, `404` | N/A | [x] |
| **Admin** | `PATCH /api/admin/posts/:postId/moderation` | Protected (ADMIN) | `moderateContentSchema` | `200`, `400`, `401`, `403`, `404` | N/A | [x] |
| **Admin** | `PATCH /api/admin/comments/:commentId/moderation` | Protected (ADMIN) | `moderateContentSchema` | `200`, `400`, `401`, `403`, `404` | N/A | [x] |
| **Admin** | `PATCH /api/admin/stories/:storyId/moderation` | Protected (ADMIN) | `moderateContentSchema` | `200`, `400`, `401`, `403`, `404` | N/A | [x] |
| **Admin** | `GET /api/admin/audit-logs` | Protected (ADMIN) | `actorId`, `action`, `targetType`, `from`, `to` | `200`, `400`, `401`, `403` | Offset / Page | [x] |
| **Admin** | `GET /api/admin/audit-logs/:id` | Protected (ADMIN) | `auditLogIdParamSchema` | `200`, `400`, `401`, `403`, `404` | N/A | [x] |
| **Admin** | `GET /api/admin/audit-logs/users/:userId/summary` | Protected (ADMIN) | `userIdParamSchema`, `from`, `to` | `200`, `400`, `401`, `403` | N/A | [x] |

---

## 2. Security & Boundary Verification

* [x] **Every implemented route documented**: All 73 REST routes are validated by `test_docs_validation.js` against `docs/openapi.yaml`.
* [x] **Auth requirements correct**: Protected routes verify JWT access token and extract `currentUserId` server-side.
* [x] **Request schemas correct**: Zod validation schemas strictly intercept unknown keys, invalid BSON ObjectIds, empty strings, and out-of-range strings.
* [x] **Response schemas correct**: Output transformers strip `password`, `role`, `__v`, `normalizedFullName`, `suspensionReason`, and Cloudinary `publicId`.
* [x] **Error responses correct**: RFC 7807 compatible error envelopes (`{ error: { code, message, requestId } }`) across all 4xx/5xx handlers.
* [x] **Pagination correct**: Safe upper bounds ($Limit \le 50$ for users/posts/comments, $Limit \le 100$ for messages).
* [x] **Status codes semantically correct**: Resource creation returns `201`, reads `200`, duplicate conflicts `409`, missing entities `404`, unauthorized `401`, forbidden `403`, bad inputs `400`.
* [x] **Admin routes protected**: Three-layer middleware pipeline (`adminLimiter` $\to$ `authenticate` $\to$ `requireAdmin` with database role verification).
* [x] **Private data protected**: Private profiles reject post and story access unless an active follow relationship exists. Bilateral blocks return `404` or `403` to prevent leaking existence.
* [x] **Socket docs aligned**: Socket.IO events (`message:send`, `conversation:read`, `typing:start`, `typing:stop`, `presence:*`) documented and synchronized with MongoDB persistence layer.
