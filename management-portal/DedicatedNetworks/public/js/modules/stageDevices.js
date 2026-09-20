/*
License: 5G-MAG Public License (v1.0)
Author: Jordi Joan Gimenez
Copyright: (C) 2026 5G-MAG Association

For full license terms please see the LICENSE file distributed with this
program. If this file is missing then the license can be retrieved from
https://hub.5g-mag.com/Getting-Started/OFFICIAL_5G-MAG_Public_License_v1.0.pdf

Stage 4 — Devices. Create device identities and attach them to the network
from Stage 2/3. This sandbox has no devices/add|remove endpoint (confirmed
empirically — see api.js) — "attaching" a device means creating another
one-device Access on the same network (exactly what Stage 3 did for the
first device); "detaching" means deleting that Access.

The Device Pool itself never locks — it's just local identities, not tied to
a network — only the "Attached to Network" section needs a network to exist.
*/

import { Api } from './api.js';
import { setSt, clrSt, escapeHtml, deviceTracker } from './uiCommon.js';
import { wizard } from './wizard.js';
import { loadPool, addToPool, savePool, toApiDevice, matchesApiDevice, identifierLine } from './devicePool.js';

export function initStageDevices(nav) {
  let pool = loadPool();
  let accesses = []; // every Access (= one device) under wizard.network

  wizard.onChange(() => { if (!document.getElementById('tab-devices').hidden) render(); });

  async function render() {
    // Re-read the pool every time this tab becomes active/re-renders —
    // Stage 3's quick-add writes to the same localStorage-backed pool.
    pool = loadPool();
    const chip = document.getElementById('devices-context-chip');
    const noNetMsg = document.getElementById('devices-no-network-msg');
    clrSt('devices-action-status');
    if (!wizard.network) {
      chip.textContent = 'No network selected yet — you can still build your device pool below.';
      noNetMsg.hidden = false;
      accesses = [];
      document.getElementById('attached-devices-list').innerHTML = '';
      renderPool();
      return;
    }
    chip.innerHTML = `Network <strong>${escapeHtml(wizard.network.name || wizard.network.id)}</strong> &mdash; one Access is created per device on this sandbox.`;
    noNetMsg.hidden = true;
    await refreshAccesses();
    renderPool();
  }

  async function refreshAccesses() {
    const r = await Api.listAccesses(wizard.network.id);
    accesses = r.ok ? (Array.isArray(r.data) ? r.data : [r.data]) : [];
    renderAttached();
  }

  function renderAttached() {
    const el = document.getElementById('attached-devices-list');
    if (!accesses.length) { el.innerHTML = '<p class="empty-hint">No devices attached yet.</p>'; return; }
    el.innerHTML = accesses.map(a => {
      const id = (a.device && (a.device.phoneNumber || a.device.networkAccessIdentifier)) || 'unknown';
      const poolMatch = pool.find(p => matchesApiDevice(p, a.device));
      return `<div class="toolbar" style="justify-content:space-between;align-items:flex-start;margin-top:0;margin-bottom:0.6rem;padding-bottom:0.6rem;border-bottom:1px solid var(--border);">
        <div>
          <span class="field-name">${escapeHtml(poolMatch ? poolMatch.name : id)}</span>
          <div class="field-key">${escapeHtml(id)}</div>
          ${deviceTracker(a.status, a.statusInfo)}
        </div>
        <button class="btn btn-danger btn-sm" data-detach-access="${a.id}">Detach</button>
      </div>`;
    }).join('');
    el.querySelectorAll('[data-detach-access]').forEach(btn => btn.addEventListener('click', async () => {
      if (!confirm('This deletes the device’s access to the network. Continue?')) return;
      btn.textContent = '…'; btn.disabled = true;
      const r = await Api.deleteAccess(btn.dataset.detachAccess);
      if (r.status === 204 || r.ok) {
        setSt('devices-action-status', 'Device detached.', true);
        window.showToast('Device detached.', 'success');
        await refreshAccesses();
      } else {
        const msg = 'Detach failed: ' + (r.data.message || r.data.error || 'HTTP ' + r.status);
        setSt('devices-action-status', msg, false);
        window.showToast(msg, 'error');
        console.error('Detach failed', r);
        btn.textContent = 'Detach'; btn.disabled = false;
      }
    }));
  }

  function renderPool() {
    const el = document.getElementById('device-pool-list');
    if (!pool.length) { el.innerHTML = '<p class="empty-hint">No devices yet. Click &ldquo;+ Add Device&rdquo; to build your pool.</p>'; return; }
    el.innerHTML = pool.map(d => {
      const isAttached = accesses.some(a => matchesApiDevice(d, a.device));
      return `<div class="toolbar" style="justify-content:space-between;margin-top:0;margin-bottom:0.4rem;padding-bottom:0.4rem;border-bottom:1px solid var(--border);">
        <div>
          <span class="field-name">${escapeHtml(d.name)}</span>
          <div class="field-key">${identifierLine(d)}</div>
        </div>
        <div>
          ${isAttached
            ? '<span class="badge badge-success">Attached</span>'
            : wizard.network
              ? `<button class="btn btn-primary btn-sm" data-attach-id="${d.id}">Attach</button>`
              : '<span class="form-hint" style="display:inline;">Select a network to attach</span>'}
          <button class="btn btn-ghost btn-sm" data-del-id="${d.id}" title="Remove from pool">&times;</button>
        </div>
      </div>`;
    }).join('');
    el.querySelectorAll('[data-attach-id]').forEach(btn => btn.addEventListener('click', async () => {
      const d = pool.find(x => x.id === btn.dataset.attachId);
      btn.textContent = '…'; btn.disabled = true;
      const r = await Api.createAccess({ networkId: wizard.network.id, device: toApiDevice(d) });
      if (r.ok) {
        setSt('devices-action-status', 'Device attached.', true);
        window.showToast('Device attached.', 'success');
        await refreshAccesses();
      } else {
        const msg = 'Attach failed: ' + (r.data.message || r.data.error || 'HTTP ' + r.status);
        setSt('devices-action-status', msg, false);
        window.showToast(msg, 'error');
        console.error('Attach failed', r);
      }
      btn.textContent = 'Attach'; btn.disabled = false;
      renderPool();
    }));
    el.querySelectorAll('[data-del-id]').forEach(btn => btn.addEventListener('click', () => {
      const isAttached = accesses.some(a => matchesApiDevice(pool.find(x => x.id === btn.dataset.delId), a.device));
      if (isAttached && !confirm('This device still has an access on the API side. Remove it from your local pool anyway? (It stays attached on the API side.)')) return;
      pool = pool.filter(d => d.id !== btn.dataset.delId);
      savePool(pool);
      renderPool();
    }));
  }

  // ── Add-to-pool form ──
  document.getElementById('add-pool-device-btn').addEventListener('click', () => {
    document.getElementById('pool-add-form').hidden = false;
    document.getElementById('pool-dev-name').focus();
  });
  document.getElementById('pool-cancel-btn').addEventListener('click', clearPoolForm);
  function clearPoolForm() {
    document.getElementById('pool-add-form').hidden = true;
    ['pool-dev-name', 'pool-dev-phone', 'pool-dev-naid', 'pool-dev-ip'].forEach(id => document.getElementById(id).value = '');
  }
  document.getElementById('pool-save-btn').addEventListener('click', () => {
    const name = document.getElementById('pool-dev-name').value.trim();
    const phone = document.getElementById('pool-dev-phone').value.trim();
    const naid = document.getElementById('pool-dev-naid').value.trim();
    const ip = document.getElementById('pool-dev-ip').value.trim();
    if (!name) { setSt('pool-status', 'Please enter a name.', false); return; }
    if (!phone && !naid && !ip) { setSt('pool-status', 'Provide at least one identifier (phone, NAID, or IP).', false); return; }
    addToPool(pool, { name, phone, naid, ip });
    clearPoolForm();
    clrSt('pool-status');
    renderPool();
  });

  return {
    activate() { render(); },
    deactivate() {}
  };
}
