import { Router } from 'express';
import { authenticate } from '../middleware/authMiddleware.js';
import { validate } from '../middleware/validate.js';
import {
  notificationIdParamSchema,
  notificationQuerySchema,
} from '../validations/notificationValidation.js';
import {
  getNotifications,
  getUnreadCount,
  markNotificationAsRead,
  markAllNotificationsAsRead,
} from '../controllers/notificationController.js';

const router = Router();

// All notification routes are protected
router.use(authenticate);

// Specific routes MUST be declared before parameterized routes to avoid router shadowing
router.get('/unread-count', getUnreadCount);
router.patch('/read-all', markAllNotificationsAsRead);

// Paginated notification list
router.get('/', validate({ query: notificationQuerySchema }), getNotifications);

// Single notification operations
router.patch(
  '/:notificationId/read',
  validate({ params: notificationIdParamSchema }),
  markNotificationAsRead
);

export default router;
