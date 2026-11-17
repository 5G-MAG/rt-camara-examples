/*
License: 5G-MAG Public License (v1.0)
Author: Jordi Joan Gimenez
Copyright: (C) 2026 5G-MAG Association

For full license terms please see the LICENSE file distributed with this
program. If this file is missing then the license can be retrieved from
https://hub.5g-mag.com/Getting-Started/OFFICIAL_5G-MAG_Public_License_v1.0.pdf

Local device-identity pool — shared by Stage 3 (which needs one device to
create its first Access, since this sandbox requires `device` on create) and
Stage 4 (full pool management + one Access per additional device). CAMARA
has no device-directory endpoint, so this pool is client-only, same as the
original portal.
*/

const KEY = 'dn_device_pool';

export function loadPool() { try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch (_) { return []; } }
export function savePool(pool) { try { localStorage.setItem(KEY, JSON.stringify(pool)); } catch (_) {} }

export function addToPool(pool, { name, phone, naid, ip }) {
  const d = { id: 'dev_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7), name, phone, naid, ip };
  pool.push(d);
  savePool(pool);
  return d;
}

/** This sandbox's Access shape takes a single `device` object — build it
 * from whichever identifier(s) a pool entry has. */
export function toApiDevice(d) {
  const out = {};
  if (d.phone) out.phoneNumber = d.phone;
  if (d.naid) out.networkAccessIdentifier = d.naid;
  if (d.ip) { if (d.ip.includes(':')) out.ipv6Address = d.ip; else out.ipv4Address = { publicAddress: d.ip }; }
  return out;
}

export function matchesApiDevice(poolDev, apiDevice) {
  if (!apiDevice) return false;
  if (poolDev.phone && apiDevice.phoneNumber === poolDev.phone) return true;
  if (poolDev.naid && apiDevice.networkAccessIdentifier === poolDev.naid) return true;
  if (poolDev.ip && (apiDevice.ipv6Address === poolDev.ip || (apiDevice.ipv4Address && apiDevice.ipv4Address.publicAddress === poolDev.ip))) return true;
  return false;
}

// PhoneNumber pattern from the Accesses API definition (E.164 with a leading '+').
export const PHONE_RE = /^\+[1-9][0-9]{4,14}$/;

/** Parse "phone[,name]" lines (comma or semicolon). A first line whose phone
 * column starts with "phone" is a header and is skipped. */
export function parseDeviceCsv(text) {
  const rows = [], errors = [], seen = new Set();
  let duplicates = 0;
  const unquote = v => v.trim().replace(/^"(.*)"$/, '$1').trim();
  String(text).replace(/^\uFEFF/, '').split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (!line) return;
    const cut = line.search(/[,;]/);
    const phone = unquote(cut < 0 ? line : line.slice(0, cut));
    const name = cut < 0 ? '' : unquote(line.slice(cut + 1));
    if (rows.length === 0 && errors.length === 0 && duplicates === 0 && i === 0 && /^phone/i.test(phone)) return;
    if (!PHONE_RE.test(phone)) { errors.push('line ' + (i + 1) + ': ' + (phone || '(empty)')); return; }
    if (seen.has(phone)) { duplicates++; return; }
    seen.add(phone);
    rows.push({ phone, name });
  });
  return { rows, errors, duplicates };
}

export function identifierLine(d) {
  return [d.phone, d.naid, d.ip].filter(Boolean).join(' &middot; ') || '—';
}
