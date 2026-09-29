/*
License: 5G-MAG Public License (v1.0)
Author: Jordi Joan Gimenez
Copyright: (C) 2026 5G-MAG Association

For full license terms please see the LICENSE file distributed with this
program. If this file is missing then the license can be retrieved from
https://hub.5g-mag.com/Getting-Started/OFFICIAL_5G-MAG_Public_License_v1.0.pdf

Stage 4 — Devices. Create a device (phone number / MSISDN), pick one from a
drop-down to give it access to the current network, and see every access
each device is part of. This sandbox has no devices/add|remove endpoint
(confirmed empirically, see api.js), so giving a device access means creating
another one-device Access on the network (exactly what Stage 3 did for the
first device), and removing it means deleting that Access.

The accesses listed per device come from GET /accesses with no filter, i.e.
every access of this API consumer on any network, so a device that is part
of two accesses (for example one per network) shows both.

Creating devices never locks; only giving one access needs a network.
*/

import { Api } from './api.js';
import { setSt, clrSt, escapeHtml, statusBadge } from './uiCommon.js';
import { wizard } from './wizard.js';
import { loadPool, addToPool, savePool, toApiDevice, matchesApiDevice, identifierLine } from './devicePool.js';

export function initStageDevices(nav) {
  let pool = loadPool();
  let accesses = []; // every Access of this API consumer, on any network
  const networkNames = {}; // network id -> name, for labelling accesses

  wizard.onChange(() => { if (!document.getElementById('tab-devices').hidden) render(); });

  async function render() {
    // Re-read the pool every time this tab becomes active/re-renders —
    // Stage 3's quick-add writes to the same localStorage-backed pool.
    pool = loadPool();
    const chip = document.getElementById('devices-context-chip');
    clrSt('devices-action-status');
    document.getElementById('devices-no-network-msg').hidden = !!wizard.network;
    document.getElementById('devices-attach-form').hidden = !wizard.network;
    chip.innerHTML = wizard.network
      ? `Current network <strong>${escapeHtml(wizard.network.name || wizard.network.id)}</strong>; one Access is created per device on this sandbox.`
      : 'No network selected yet; you can still create devices below.';
    await refreshAccesses();
  }

  async function refreshAccesses() {
    const [r, n] = await Promise.all([Api.listAllAccesses(), Api.listNetworks()]);
    accesses = r.ok ? (Array.isArray(r.data) ? r.data : [r.data]) : [];
    if (!r.ok) setSt('devices-action-status', 'Could not load accesses: HTTP ' + r.status, false);
    if (n.ok && Array.isArray(n.data)) n.data.forEach(x => { if (x && x.id) networkNames[x.id] = x.name || ''; });
    renderAttachSelect();
    renderDevices();
  }

  function onCurrentNetwork(d) {
    return !!wizard.network && accesses.some(a => a.networkId === wizard.network.id && matchesApiDevice(d, a.device));
  }

  function renderAttachSelect() {
    const sel = document.getElementById('devices-attach-select');
    const withPhone = pool.filter(d => d.phone);
    sel.innerHTML = '<option value="">-- Pick a device --</option>' + withPhone.map(d => {
      const already = onCurrentNetwork(d);
      return `<option value="${d.id}" ${already ? 'disabled' : ''}>${escapeHtml(d.phone)}${d.name && d.name !== d.phone ? ' (' + escapeHtml(d.name) + ')' : ''}${already ? ' - already has an access on this network' : ''}</option>`;
    }).join('');
  }

  document.getElementById('devices-attach-btn').addEventListener('click', async function () {
    const btn = this;
    const d = pool.find(x => x.id === document.getElementById('devices-attach-select').value);
    if (!wizard.network) return;
    if (!d) { setSt('devices-action-status', 'Pick a device first.', false); return; }
    btn.textContent = '…'; btn.disabled = true;
    const r = await Api.createAccess({ networkId: wizard.network.id, device: toApiDevice(d) });
    btn.textContent = 'Create access'; btn.disabled = false;
    if (r.ok) {
      setSt('devices-action-status', 'Access created.', true);
      window.showToast('Access created.', 'success');
      await refreshAccesses();
    } else {
      const msg = 'Create access failed: ' + (r.data.message || r.data.error || 'HTTP ' + r.status);
      setSt('devices-action-status', msg, false);
      window.showToast(msg, 'error');
      console.error('Create access failed', r);
    }
  });

  function accessRow(a) {
    const isCurrent = wizard.network && a.networkId === wizard.network.id;
    const netLabel = networkNames[a.networkId] || (a.networkId ? a.networkId.slice(0, 8) + '…' : 'unknown network');
    return `<div class="toolbar" style="justify-content:space-between;margin:0.2rem 0;">
        <span>${escapeHtml(netLabel)}${isCurrent ? ' <span class="form-hint" style="display:inline;">(current network)</span>' : ''} ${statusBadge(a.status)}</span>
        <button class="btn btn-danger btn-sm" data-detach-access="${a.id}">Delete access</button>
      </div>`;
  }

  function deviceBlock(title, idLine, devAccesses, delId) {
    return `<div style="margin-bottom:0.6rem;padding-bottom:0.6rem;border-bottom:1px solid var(--border);">
        <div class="toolbar" style="justify-content:space-between;margin:0;">
          <div><span class="field-name">${escapeHtml(title)}</span><div class="field-key">${idLine}</div></div>
          ${delId ? `<button class="btn btn-ghost btn-sm" data-del-id="${delId}" title="Remove from this browser's device list">&times;</button>` : ''}
        </div>
        ${devAccesses.length ? devAccesses.map(accessRow).join('') : '<p class="form-hint">Not part of any access.</p>'}
      </div>`;
  }

  function renderDevices() {
    const el = document.getElementById('device-pool-list');
    const matched = new Set();
    let html = pool.map(d => {
      const devAccesses = accesses.filter(a => matchesApiDevice(d, a.device));
      devAccesses.forEach(a => matched.add(a.id));
      return deviceBlock(d.name || d.phone, identifierLine(d), devAccesses, d.id);
    }).join('');
    // Accesses whose device was never created in this browser (e.g. made
    // from another machine) are still shown, grouped by device identifier.
    const others = {};
    accesses.filter(a => !matched.has(a.id)).forEach(a => {
      const id = (a.device && (a.device.phoneNumber || a.device.networkAccessIdentifier || a.device.ipv6Address || (a.device.ipv4Address && a.device.ipv4Address.publicAddress))) || 'unknown device';
      (others[id] = others[id] || []).push(a);
    });
    html += Object.keys(others).map(id => deviceBlock(id, 'not in this browser&rsquo;s device list', others[id], null)).join('');
    el.innerHTML = html || '<p class="empty-hint">No devices yet. Create one above.</p>';

    el.querySelectorAll('[data-detach-access]').forEach(btn => btn.addEventListener('click', async () => {
      if (!confirm('This deletes the device’s access to the network. Continue?')) return;
      btn.textContent = '…'; btn.disabled = true;
      const r = await Api.deleteAccess(btn.dataset.detachAccess);
      if (r.status === 204 || r.ok) {
        setSt('devices-action-status', 'Access deleted.', true);
        window.showToast('Access deleted.', 'success');
        await refreshAccesses();
      } else {
        const msg = 'Delete failed: ' + (r.data.message || r.data.error || 'HTTP ' + r.status);
        setSt('devices-action-status', msg, false);
        window.showToast(msg, 'error');
        console.error('Delete access failed', r);
        btn.textContent = 'Delete access'; btn.disabled = false;
      }
    }));
    el.querySelectorAll('[data-del-id]').forEach(btn => btn.addEventListener('click', () => {
      const d = pool.find(x => x.id === btn.dataset.delId);
      const inAccess = accesses.some(a => matchesApiDevice(d, a.device));
      if (inAccess && !confirm('This device is still part of an access on the API side. Remove it from this browser anyway? (Its accesses are not deleted.)')) return;
      pool = pool.filter(x => x.id !== btn.dataset.delId);
      savePool(pool);
      renderAttachSelect();
      renderDevices();
    }));
  }

  // ── Create device form ──
  document.getElementById('pool-save-btn').addEventListener('click', () => {
    const phone = document.getElementById('pool-dev-phone').value.trim();
    const name = document.getElementById('pool-dev-name').value.trim();
    if (!phone) { setSt('pool-status', 'Enter the phone number (MSISDN).', false); return; }
    // PhoneNumber pattern from the Accesses API definition (E.164 with a leading '+').
    if (!/^\+[1-9][0-9]{4,14}$/.test(phone)) { setSt('pool-status', 'Use international format with a leading +, e.g. +41799445408.', false); return; }
    if (pool.some(d => d.phone === phone)) { setSt('pool-status', 'A device with this phone number already exists.', false); return; }
    addToPool(pool, { name: name || phone, phone });
    ['pool-dev-phone', 'pool-dev-name'].forEach(id => { document.getElementById(id).value = ''; });
    setSt('pool-status', 'Device created.', true);
    renderAttachSelect();
    renderDevices();
  });

  return {
    activate() { render(); },
    deactivate() {}
  };
}
