import notificationService from '../services/notificationService.js';

/**
 * GET /api/notifications
 * Retrieves paginated notifications for the authenticated user.
 */
export const getNotifications = async (req, res, next) => {
  try {
    const result = await notificationService.getNotifications(
      req.user.userId,
      req.query
    );

    res.status(200).json({
      success: true,
      message: 'Notifications fetched successfully',
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/notifications/unread-count
 * Retrieves the count of unread notifications for the authenticated user.
 */
export const getUnreadCount = async (req, res, next) => {
  try {
    const result = await notificationService.getUnreadCount(req.user.userId);

    res.status(200).json({
      success: true,
      message: 'Unread count fetched successfully',
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/notifications/:notificationId/read
 * Marks a single notification as read.
 */
export const markNotificationAsRead = async (req, res, next) => {
  try {
    const notification = await notificationService.markNotificationAsRead(
      req.params.notificationId,
      req.user.userId
    );

    res.status(200).json({
      success: true,
      message: 'Notification marked as read',
      data: { notification },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/notifications/read-all
 * Marks all unread notifications of the user as read.
 */
export const markAllNotificationsAsRead = async (req, res, next) => {
  try {
    const result = await notificationService.markAllNotificationsAsRead(
      req.user.userId
    );

    res.status(200).json({
      success: true,
      message: 'All notifications marked as read',
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

export default {
  getNotifications,
  getUnreadCount,
  markNotificationAsRead,
  markAllNotificationsAsRead,
};
