import React, { useState, useEffect, useCallback } from 'react';
import notificationService from '../../services/notificationService.js';
import LoadingSpinner from '../common/LoadingSpinner.jsx';
import ErrorAlert from '../common/ErrorAlert.jsx';

const NOTIFICATION_LABELS = {
  LIKE: '❤️ liked your post',
  COMMENT: '💬 commented on your post',
  FOLLOW: '👤 started following you',
  REPLY: '💬 replied to your comment',
  MENTION: '@ mentioned you',
};

export const NotificationsView = () => {
  const [notifications, setNotifications] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [isMarkingAll, setIsMarkingAll] = useState(false);

  const loadNotifications = useCallback(async (pageNum = 1) => {
    try {
      if (pageNum === 1) setIsLoading(true);
      setError(null);
      const [notifRes, countRes] = await Promise.all([
        notificationService.getNotifications({ page: pageNum, limit: 20 }),
        notificationService.getUnreadCount(),
      ]);
      const newNotifs = notifRes?.data?.notifications || [];
      setNotifications((prev) => pageNum === 1 ? newNotifs : [...prev, ...newNotifs]);
      setHasMore(notifRes?.data?.pagination?.hasNextPage || false);
      setUnreadCount(countRes?.data?.unreadCount || 0);
    } catch (err) {
      setError(err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadNotifications(1);
  }, [loadNotifications]);

  const handleMarkAsRead = async (notificationId) => {
    try {
      await notificationService.markAsRead(notificationId);
      setNotifications((prev) =>
        prev.map((n) => (n._id === notificationId ? { ...n, isRead: true } : n))
      );
      setUnreadCount((c) => Math.max(0, c - 1));
    } catch (err) {
      setError(err);
    }
  };

  const handleMarkAllAsRead = async () => {
    setIsMarkingAll(true);
    try {
      await notificationService.markAllAsRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
      setUnreadCount(0);
    } catch (err) {
      setError(err);
    } finally {
      setIsMarkingAll(false);
    }
  };

  if (isLoading) return <LoadingSpinner message="Loading notifications…" size="large" />;

  return (
    <div className="notifications-view">
      <div className="notifications-header">
        <h1>Notifications</h1>
        {unreadCount > 0 && (
          <button
            id="mark-all-read-btn"
            type="button"
            className="btn btn-outline btn-sm"
            onClick={handleMarkAllAsRead}
            disabled={isMarkingAll}
          >
            {isMarkingAll ? 'Marking…' : 'Mark all as read'}
          </button>
        )}
      </div>

      <ErrorAlert error={error} onDismiss={() => setError(null)} />

      {notifications.length === 0 && !error && (
        <div className="empty-state">
          <p>No notifications yet.</p>
        </div>
      )}

      <ul className="notifications-list" aria-live="polite" aria-label="Notifications">
        {notifications.map((notif) => (
          <li
            key={notif._id}
            className={`notification-item${notif.isRead ? '' : ' notification-item--unread'}`}
          >
            <div className="notification-content">
              {notif.actor?.profilePicture ? (
                <img
                  src={notif.actor.profilePicture}
                  alt={`${notif.actor.username} avatar`}
                  className="avatar avatar-sm"
                  loading="lazy"
                />
              ) : (
                <div className="avatar avatar-sm avatar-placeholder" aria-hidden="true">
                  {(notif.actor?.username || '?')[0].toUpperCase()}
                </div>
              )}
              <div className="notification-text">
                {/* Plain text rendering — all content is safe */}
                <span className="notification-actor">{notif.actor?.username || 'Someone'}</span>
                {' '}
                <span className="notification-action">
                  {NOTIFICATION_LABELS[notif.type] || notif.type}
                </span>
              </div>
            </div>
            {!notif.isRead && (
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => handleMarkAsRead(notif._id)}
                aria-label="Mark notification as read"
              >
                ✓
              </button>
            )}
          </li>
        ))}
      </ul>

      {hasMore && (
        <div className="load-more-center">
          <button
            type="button"
            className="btn btn-outline"
            onClick={() => {
              const next = page + 1;
              setPage(next);
              loadNotifications(next);
            }}
          >
            Load more
          </button>
        </div>
      )}
    </div>
  );
};

export default NotificationsView;
