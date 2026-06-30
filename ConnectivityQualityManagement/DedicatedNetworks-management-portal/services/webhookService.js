/*
License: 5G-MAG Public License (v1.0)
Author: Jordi Joan Gimenez
Copyright: (C) 2026 5G-MAG Association

For full license terms please see the LICENSE file distributed with this
program. If this file is missing then the license can be retrieved from
https://hub.5g-mag.com/Getting-Started/OFFICIAL_5G-MAG_Public_License_v1.0.pdf
*/

// In-memory store for received notifications.
// In a production system this would be a database.
const notifications = [];
const MAX_STORED = 200;

/**
 * Store an incoming notification and attach metadata.
 */
function storeNotification(source, body) {
  const entry = {
    id: `notif_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    receivedAt: new Date().toISOString(),
    source,
    body
  };
  notifications.unshift(entry); // newest first
  if (notifications.length > MAX_STORED) {
    notifications.splice(MAX_STORED);
  }
  console.log(`[webhook] Notification received from ${source}:`, JSON.stringify(body).slice(0, 120));
  return entry;
}

/**
 * Return all stored notifications, optionally filtered by source.
 */
function getNotifications(source) {
  if (source) return notifications.filter(n => n.source === source);
  return notifications;
}

/**
 * Clear all stored notifications.
 */
function clearNotifications() {
  notifications.splice(0);
}

/**
 * Build the sink URL for a given resource type.
 * e.g. sinkUrl('networks') -> https://your-host.com/webhooks/networks
 */
function sinkUrl(resource) {
  const base = (process.env.SINK_BASE_URL || '').replace(/\/+$/, '');
  if (!base || base.includes('undefined')) return null;
  return `${base}/webhooks/${resource}`;
}

module.exports = { storeNotification, getNotifications, clearNotifications, sinkUrl };
