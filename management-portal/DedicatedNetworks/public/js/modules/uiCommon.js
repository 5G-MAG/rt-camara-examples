/*
License: 5G-MAG Public License (v1.0)
Author: Jordi Joan Gimenez
Copyright: (C) 2026 5G-MAG Association

For full license terms please see the LICENSE file distributed with this
program. If this file is missing then the license can be retrieved from
https://hub.5g-mag.com/Getting-Started/OFFICIAL_5G-MAG_Public_License_v1.0.pdf

Small, dependency-free helpers shared by every stage module: formatting,
a status-line setter, a status badge, and the lifecycle tracker — all built
from the shared 5G-MAG style.css vocabulary (.status-line, .badge), nothing
of its own invented.
*/

// ── Formatting ─────────────────────────────────────────────────
export function fmtTp(o) { return o && o.value != null ? o.value + ' ' + (o.unit || '') : JSON.stringify(o); }

export function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const time = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  return `${day}/${month}/${d.getFullYear()} ${time}`;
}

export function fmtDuration(startIso, endIso) {
  if (!startIso || !endIso) return '—';
  const ms = new Date(endIso) - new Date(startIso);
  if (ms <= 0) return '—';
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return (h ? h + 'h ' : '') + m + 'm';
}

export function pad(n) { return n < 10 ? '0' + n : String(n); }

// A labelled value, reusing the existing .form-row/.form-label classes for
// display rather than only for editable fields.
export function drow(label, value) {
  return `<div class="form-row"><label class="form-label">${label}</label><div>${value}</div></div>`;
}

export function escapeHtml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── Status line — same pattern as rt-mbs-application-provider's
// #us-status-line (textContent + status-success/status-error class toggle). ──
export function setSt(id, msg, ok) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = msg;
  el.classList.remove('status-success', 'status-error');
  el.classList.add(ok ? 'status-success' : 'status-error');
}
export function clrSt(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = '';
  el.classList.remove('status-success', 'status-error');
}

// ── Status badge (.badge + a semantic variant) — each status keeps the same
// fixed color everywhere it appears (list rows, lifecycle tracker), so a
// color always means the same thing: amber = requested/pending, violet =
// reserved, green = active, red = denied/terminated. ──
const STATUS_VARIANT = {
  REQUESTED: 'badge-warning',
  RESERVED: 'badge-reserved',
  ACTIVATED: 'badge-success',
  TERMINATED: 'badge-danger',
  GRANTED: 'badge-success',
  DENIED: 'badge-danger',
  PENDING: 'badge-warning'
};
export function statusBadge(s) {
  return `<span class="badge ${STATUS_VARIANT[s] || 'badge-neutral'}">${s || 'UNKNOWN'}</span>`;
}

// ── Lifecycle tracker: every possible state as a badge, each in its own
// fixed color (via STATUS_VARIANT above) rather than a uniform "done = green"
// — reached/current steps at full opacity, not-yet-reached ones faded. ──
const NETWORK_STEPS = [
  { key: 'REQUESTED', meaning: 'Not yet committed by the Network Provider.' },
  { key: 'RESERVED', meaning: 'Committed to be available during the Service Time (not usable yet).' },
  { key: 'ACTIVATED', meaning: 'Usable now — devices with granted access can use the network.' },
  { key: 'TERMINATED', meaning: 'Used up / removed. Cannot be modified anymore.' }
];
const DEVICE_STEPS = [
  { key: 'REQUESTED', meaning: "Access requested, awaiting the provider's decision." },
  { key: 'GRANTED', meaning: 'Access approved — usable once the network is ACTIVATED.' }
];
const DEVICE_DENIED = { key: 'DENIED', meaning: "Access rejected or revoked — this device can't use the network." };
const REASON_TEXT = {
  REQUEST_APPROVED: 'Access to the network was approved.',
  REQUEST_REJECTED: 'The access request was rejected.',
  REQUEST_FAILED: 'A failure occurred while approving the request.',
  ACCESS_REVOKED: 'Access was revoked after having been granted.',
  ACCESS_FAILED: 'A failure occurred after access had been granted.'
};

// Only the CURRENT step gets its real semantic color — past and future
// steps are both neutral grey (past solid, future faded), so the one status
// that actually matters right now is the only thing your eye lands on.
function badge(key, title, position) {
  const variant = position === 'current' ? (STATUS_VARIANT[key] || 'badge-neutral') : 'badge-neutral';
  const cls = position === 'future' ? ' is-future' : '';
  return `<span class="badge ${variant}${cls}" title="${escapeHtml(title)}">${key}</span>`;
}

/** Renders the full network lifecycle (REQUESTED→RESERVED→ACTIVATED→TERMINATED). */
export function networkTracker(status) {
  const idx = NETWORK_STEPS.findIndex(s => s.key === status);
  return '<div class="lifecycle-row">' + NETWORK_STEPS.map((s, i) => {
    const position = i < idx ? 'past' : i === idx ? 'current' : 'future';
    return badge(s.key, s.meaning, position);
  }).join('') + '</div>';
}

/**
 * Renders a device's access lifecycle (REQUESTED→GRANTED, with DENIED as a
 * failure branch reachable from either state). `reason` is the optional
 * DeviceStatusInfo/statusInfo object ({code, message}) from the API.
 */
export function deviceTracker(status, reason) {
  if (status === 'DENIED') {
    const reasonTxt = reason && (REASON_TEXT[reason.code] || reason.message);
    return '<div class="lifecycle-row">'
      + DEVICE_STEPS.map(s => badge(s.key, s.meaning, 'past')).join('')
      + badge(DEVICE_DENIED.key, reasonTxt || DEVICE_DENIED.meaning, 'current')
      + '</div>';
  }
  const idx = DEVICE_STEPS.findIndex(s => s.key === status);
  return '<div class="lifecycle-row">' + DEVICE_STEPS.map((s, i) => {
    const position = i < idx ? 'past' : i === idx ? 'current' : 'future';
    return badge(s.key, s.meaning, position);
  }).join('') + '</div>';
}
