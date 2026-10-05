/*
License: 5G-MAG Public License (v1.0)
Author: Jordi Joan Gimenez
Copyright: (C) 2026 5G-MAG Association

For full license terms please see the LICENSE file distributed with this
program. If this file is missing then the license can be retrieved from
https://hub.5g-mag.com/Getting-Started/OFFICIAL_5G-MAG_Public_License_v1.0.pdf

CAMARA posts CloudEvents to this portal's /webhooks/:resource receiver. This
module polls the stored events, lists them in every callback panel, and
notifies subscribers about each new event so a status tracker can refresh at
once instead of waiting for its next poll.
*/

import { Api } from './api.js';
import { startPolling } from './polling.js';
import { escapeHtml } from './uiCommon.js';

const panels = [];
const listeners = new Set();
let entries = [];
let seenIds = new Set();
let primed = false;
let sinkBase = null;

export function subscribeCallbacks(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function mountCallbackPanel(container, source) {
  const panel = { container, source, html: null };
  panels.push(panel);
  renderPanel(panel);
}

// The resource a CloudEvent is about: data.networkId or data.accessId.
export function eventRef(entry) {
  const d = (entry && entry.body && entry.body.data) || {};
  return { networkId: d.networkId || null, accessId: d.accessId || null };
}

function summarise(body) {
  const d = (body && body.data) || {};
  if (d.networkId) return `Network ${d.networkId}: status ${d.status || '?'}`;
  if (d.accessId) {
    const devices = (d.accessDevices || []).map(x => {
      const who = (x.device && (x.device.phoneNumber || x.device.ipv4Address)) || x.deviceId || 'device';
      return `${who}: ${x.status || '?'}`;
    });
    return `Access ${d.accessId}` + (devices.length ? ' · ' + devices.join(', ') : (d.status ? ': status ' + d.status : ''));
  }
  return 'Event without a network or access reference';
}

function itemHtml(entry) {
  const body = entry.body || {};
  const type = String(body.type || 'unknown').split('.').pop();
  const when = new Date(entry.receivedAt).toLocaleTimeString();
  return `
    <div class="form-row">
      <span class="field-name">${escapeHtml(type)}</span>
      <span class="field-key">${escapeHtml(when)}</span>
      <div class="form-hint">${escapeHtml(summarise(body))}</div>
      <details><summary>Raw event</summary>
        <pre style="white-space:pre-wrap;font-size:0.8rem;">${escapeHtml(JSON.stringify(body, null, 2))}</pre>
      </details>
    </div>`;
}

function sinkLine(source) {
  if (!sinkBase) {
    return '<p class="form-hint">Callbacks are off: SINK_BASE_URL is not set, so CAMARA has no address to send events to. Set it in Configuration to a public https address that reaches this portal.</p>';
  }
  return `<p class="form-hint">Receiving at ${escapeHtml(sinkBase)}/webhooks/${escapeHtml(source)}</p>`;
}

function renderPanel(panel) {
  const { container, source } = panel;
  const list = entries.filter(e => e.source === source).slice(0, 30);
  const html = sinkLine(source)
    + (list.length ? list.map(itemHtml).join('') : '<p class="empty-hint">No callbacks received yet.</p>');
  if (html === panel.html) return;
  panel.html = html;
  container.innerHTML = html;
}

function sinkFromConfig(config) {
  const base = String(config.SINK_BASE_URL || '').replace(/\/+$/, '');
  return base && !base.includes('undefined') ? base : null;
}

export function startCallbackLog() {
  return startPolling(async () => {
    const [notifications, config] = await Promise.all([Api.notifications(), Api.getConfig()]);
    if (!notifications.ok) return 'fast';
    const incoming = Array.isArray(notifications.data) ? notifications.data : [];
    const fresh = incoming.filter(e => !seenIds.has(e.id));
    seenIds = new Set(incoming.map(e => e.id));
    entries = incoming;
    if (config.ok) sinkBase = sinkFromConfig(config.data);
    if (primed) {
      fresh.slice().reverse().forEach(e => listeners.forEach(fn => {
        try { fn(e); } catch (_) { /* a listener must not stop the log */ }
      }));
    }
    primed = true;
    panels.forEach(renderPanel);
    return 'fast';
  }, { fastMs: 4000, slowMs: 4000 });
}
