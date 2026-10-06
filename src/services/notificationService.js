import { storage } from '../storage/localStorage';
import { nextId } from '../utils/id';
import { isNotificationVisible } from './accessService';

// Single notification system — the topbar badge and the Notifications page
// both read through here, and every notification the app creates is written
// through here, so there is one source of truth for read/unread state.

export function getNotifications() {
  return storage.read(storage.KEYS.NOTIFICATIONS, []);
}

export function getUnreadCount() {
  return getNotifications().filter((n) => !n.read).length;
}

// Recipient-targeted reads. Every consumer that shows notifications to a
// persona should go through these so each role only sees what was addressed
// to it (see accessService.isNotificationVisible).
export function getNotificationsForRole(role) {
  return getNotifications().filter((n) => isNotificationVisible(n, role));
}

export function getUnreadCountForRole(role) {
  return getNotificationsForRole(role).filter((n) => !n.read).length;
}

/**
 * @param {Object} entry
 * @param {string} entry.title
 * @param {string} entry.description
 * @param {'info'|'warning'|'critical'} [entry.type]
 * @param {string} [entry.entityType]
 * @param {string} [entry.entityId]
 * @param {string} entry.recipientRole - ROLES id this notification is addressed to
 * @param {string} [entry.recipientName] - a specific person (e.g. the assigned manager)
 * @param {string} [entry.mineId]
 */
export function createNotification(entry) {
  const notifications = getNotifications();
  const record = {
    id: nextId('NOTIF', notifications.map((n) => n.id)),
    timestamp: new Date().toISOString(),
    type: 'info',
    read: false,
    ...entry,
  };
  storage.write(storage.KEYS.NOTIFICATIONS, [record, ...notifications]);
  return record;
}

export function markAllRead() {
  const notifications = getNotifications().map((n) => ({ ...n, read: true }));
  storage.write(storage.KEYS.NOTIFICATIONS, notifications);
  return notifications;
}

// Marks only the notifications addressed to this role as read, so one
// persona clearing its inbox never clears another persona's unread items.
export function markAllReadForRole(role) {
  const notifications = getNotifications().map((n) =>
    isNotificationVisible(n, role) ? { ...n, read: true } : n
  );
  storage.write(storage.KEYS.NOTIFICATIONS, notifications);
  return notifications.filter((n) => isNotificationVisible(n, role));
}
