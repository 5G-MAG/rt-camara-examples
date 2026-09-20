/*
License: 5G-MAG Public License (v1.0)
Author: Jordi Joan Gimenez
Copyright: (C) 2026 5G-MAG Association

For full license terms please see the LICENSE file distributed with this
program. If this file is missing then the license can be retrieved from
https://hub.5g-mag.com/Getting-Started/OFFICIAL_5G-MAG_Public_License_v1.0.pdf

Stage 3 — Access. This sandbox's Accesses API is one-device-per-access
({networkId, device, id, status, statusInfo} — confirmed empirically; the
bulk devices[]/stats/recentAccessDevices shape from the current spec 404s
here), so creating an Access requires picking (or quick-adding) one device
from the pool. Stage 4 covers attaching *more* devices, each as its own
Access on the same network.
*/

import { Api } from './api.js';
import { setSt, clrSt, escapeHtml, deviceTracker, drow, statusBadge } from './uiCommon.js';
import { wizard } from './wizard.js';
import { startPolling } from './polling.js';
import { renderCallbackConfig } from './callbackConfig.js';
import { loadPool, addToPool, toApiDevice, identifierLine } from './devicePool.js';

export function initStageAccess(nav) {
  let poller = null;

  wizard.onChange(() => { if (!document.getElementById('tab-access').hidden) render(); });

  function render() {
    const locked = document.getElementById('access-locked-msg');
    const body = document.getElementById('access-body');
    const mainWrap = document.getElementById('access-main-wrap');
    if (!wizard.network) { locked.hidden = false; body.hidden = true; mainWrap.hidden = true; return; }
    locked.hidden = true; body.hidden = false; mainWrap.hidden = false;
    renderNetworkChip();
    loadAccessesList();
    if (wizard.access) renderAccessDetail(wizard.access);
    else renderCreateForm();
  }

  function renderNetworkChip() {
    const n = wizard.network;
    document.getElementById('access-network-chip').innerHTML =
      `<span class="field-name">${escapeHtml(n.name || n.id)}</span> ${statusBadge(n.status)}`
      + `<div class="field-key">${n.id}</div>`;
  }
  document.getElementById('access-change-network-btn').addEventListener('click', () => nav.goTo('network'));

  document.getElementById('load-accesses-btn').addEventListener('click', () => loadAccessesList());
  async function loadAccessesList() {
    const list = document.getElementById('accesses-list');
    list.innerHTML = ''; clrSt('accesses-status');
    const r = await Api.listAccesses(wizard.network.id);
    if (!r.ok) { setSt('accesses-status', 'HTTP ' + r.status + ': ' + (r.data.message || r.data.error || 'Error'), false); return; }
    const accesses = Array.isArray(r.data) ? r.data : [r.data];
    setSt('accesses-status', accesses.length + ' access(es) — one per device', true);
    if (!accesses.length) { list.innerHTML = '<p class="empty-hint">None yet.</p>'; return; }
    accesses.forEach(a => {
      const id = (a.device && (a.device.phoneNumber || a.device.networkAccessIdentifier)) || 'device';
      const el = document.createElement('div'); el.className = 'form-row list-row-clickable';
      if (wizard.access && wizard.access.id === a.id) el.classList.add('active');
      el.innerHTML = `<span class="field-name">${escapeHtml(id)}</span> ${statusBadge(a.status)}`;
      el.addEventListener('click', () => {
        if (!wizard.access || wizard.access.id !== a.id) {
          if (!wizard.confirmAndResetFrom('access')) return;
        }
        wizard.setAccess(a);
      });
      list.appendChild(el);
    });
  }

  // ── Create form: requires one device (this sandbox's hard constraint) ──
  async function renderCreateForm() {
    stopPolling();
    const network = wizard.network;
    const pool = loadPool();
    const body = document.getElementById('access-main-body');
    body.innerHTML = `
      <div class="section-panel">
        <div class="section-panel-title">Device &mdash; required to create the access</div>
        <div id="access-device-pick"></div>
      </div>
      <div class="section-panel">
        <div class="section-panel-title">QoS Profile</div>
        <p class="empty-hint" id="access-qos-loading">Loading available QoS profiles…</p>
        <div id="access-qos-picker" hidden></div>
      </div>
      <div id="access-callback-config"></div>
      <p class="status-line" id="access-form-status"></p>
      <div class="toolbar" style="justify-content:flex-start;">
        <button class="btn btn-primary" id="access-create-btn">Create Access</button>
      </div>
    `;
    const callbackCfg = renderCallbackConfig(document.getElementById('access-callback-config'), 'access');
    renderDevicePicker(pool);

    // Resolve the QoS options this network actually offers.
    let qosOptions = [], defaultQos = null;
    if (network.networkProfileId) {
      const r = await Api.getNetworkProfile(network.networkProfileId);
      if (r.ok) { qosOptions = r.data.qosProfiles || []; defaultQos = r.data.defaultQosProfile || null; }
    } else if (network.qosProfileName) {
      qosOptions = [network.qosProfileName]; defaultQos = network.qosProfileName;
    }
    document.getElementById('access-qos-loading').hidden = true;
    const picker = document.getElementById('access-qos-picker');
    picker.hidden = false;
    if (!qosOptions.length) {
      picker.innerHTML = '<p class="empty-hint">No QoS profiles on this network &mdash; the access will inherit the network default.</p>';
    } else {
      picker.innerHTML = qosOptions.map(q => `
        <div class="form-row">
          <label><input type="checkbox" class="access-qos-check" value="${escapeHtml(q)}" ${q === defaultQos ? 'checked' : ''}/> ${escapeHtml(q)}${q === defaultQos ? ' <span class="form-hint" style="display:inline;">(network default)</span>' : ''}</label>
          &nbsp;&nbsp;
          <label><input type="radio" name="access-qos-default" class="access-qos-default-radio" value="${escapeHtml(q)}" ${q === defaultQos ? 'checked' : ''}/> set as default</label>
        </div>`).join('')
        + '<p class="form-hint">Check the profiles this access may use; pick one radio button as the default. Leave all unchecked to inherit the network default.</p>';
      picker.querySelectorAll('.access-qos-check').forEach(cb => cb.addEventListener('change', () => {
        const radio = cb.closest('.form-row').querySelector('.access-qos-default-radio');
        radio.disabled = !cb.checked;
        if (!cb.checked && radio.checked) { const firstChecked = picker.querySelector('.access-qos-check:checked'); if (firstChecked) firstChecked.closest('.form-row').querySelector('.access-qos-default-radio').checked = true; }
      }));
    }

    document.getElementById('access-create-btn').addEventListener('click', async function () {
      const btn = this;
      const device = getPickedDevice();
      clrSt('access-form-status');
      if (!device) { setSt('access-form-status', 'Pick or add a device first.', false); return; }
      const checked = Array.from(picker.querySelectorAll('.access-qos-check:checked')).map(cb => cb.value);
      const defaultRadio = picker.querySelector('.access-qos-default-radio:checked');
      const reqBody = { networkId: network.id, device, ...callbackCfg.getValue() };
      if (checked.length) { reqBody.qosProfiles = checked; reqBody.defaultQosProfile = (defaultRadio && defaultRadio.value) || checked[0]; }
      btn.textContent = 'Creating…'; btn.disabled = true;
      const r = await Api.createAccess(reqBody);
      btn.disabled = false; btn.textContent = 'Create Access';
      if (!r.ok) { setSt('access-form-status', 'HTTP ' + r.status + ': ' + (r.data.message || r.data.error || 'Error'), false); return; }
      window.showToast('Access created.', 'success');
      wizard.setAccess(r.data);
    });
  }

  let pickedPoolId = null, pickedInline = null;
  function getPickedDevice() {
    if (pickedInline) return pickedInline;
    const pool = loadPool();
    const d = pool.find(x => x.id === pickedPoolId);
    return d ? toApiDevice(d) : null;
  }

  function renderDevicePicker(pool) {
    pickedPoolId = null; pickedInline = null;
    const el = document.getElementById('access-device-pick');
    el.innerHTML = `
      ${pool.length ? `<div class="form-row"><select id="access-device-select"><option value="">-- Pick from device pool --</option>${pool.map(d => `<option value="${d.id}">${escapeHtml(d.name)} (${escapeHtml(identifierLine(d).replace(/&middot;/g, '/'))})</option>`).join('')}</select></div>` : '<p class="empty-hint">Your device pool is empty &mdash; add one below.</p>'}
      <p class="form-hint">or quick-add a new device to the pool:</p>
      <div class="form-row"><input type="text" id="access-quick-name" placeholder="Name, e.g. Camera 1"/></div>
      <div class="form-row"><input type="text" id="access-quick-phone" placeholder="Phone, e.g. +41799445408"/></div>
      <div class="toolbar" style="justify-content:flex-start;">
        <button class="btn btn-ghost btn-sm" id="access-quick-add-btn">+ Add to pool &amp; use</button>
      </div>
      <p class="form-hint" id="access-device-picked" hidden></p>
    `;
    const sel = document.getElementById('access-device-select');
    if (sel) sel.addEventListener('change', () => {
      pickedInline = null;
      pickedPoolId = sel.value || null;
      showPicked(pool.find(d => d.id === pickedPoolId));
    });
    document.getElementById('access-quick-add-btn').addEventListener('click', () => {
      const name = document.getElementById('access-quick-name').value.trim();
      const phone = document.getElementById('access-quick-phone').value.trim();
      if (!name || !phone) { setSt('access-form-status', 'Enter a name and phone number to quick-add a device.', false); return; }
      const d = addToPool(pool, { name, phone });
      pickedPoolId = d.id; pickedInline = null;
      if (sel) { const opt = document.createElement('option'); opt.value = d.id; opt.textContent = `${d.name} (${d.phone})`; sel.appendChild(opt); sel.value = d.id; }
      showPicked(d);
      clrSt('access-form-status');
    });
  }
  function showPicked(d) {
    const el = document.getElementById('access-device-picked');
    if (!d) { el.hidden = true; return; }
    el.hidden = false;
    el.textContent = `Using: ${d.name} (${identifierLine(d).replace(/&middot;/g, '/')})`;
  }

  // ── Access detail — top-level status/statusInfo (this sandbox's real shape) ──
  async function renderAccessDetail(a) {
    const body = document.getElementById('access-main-body');
    const deviceId = (a.device && (a.device.phoneNumber || a.device.networkAccessIdentifier)) || 'unknown device';
    body.innerHTML = `
      <div class="toolbar" style="justify-content:space-between;margin-top:0;">
        <span class="field-key">${a.id}</span>
        <div>
          <button class="btn btn-ghost btn-sm" id="access-refresh-btn">Refresh</button>
          <button class="btn btn-danger btn-sm" id="access-delete-btn">Delete</button>
        </div>
      </div>
      ${drow('Device', `<span class="field-key">${escapeHtml(deviceId)}</span>`)}
      <div id="access-tracker"></div>
      ${(a.qosProfiles && a.qosProfiles.length) ? drow('QoS Profiles', a.qosProfiles.map(q => `<span class="badge ${q === a.defaultQosProfile ? 'badge-success' : 'badge-neutral'}">${escapeHtml(q)}${q === a.defaultQosProfile ? ' (default)' : ''}</span>`).join(' ')) : ''}
      <p class="status-line" id="access-action-status"></p>
      <div class="toolbar" style="justify-content:flex-start;">
        <button class="btn btn-primary" id="access-continue-btn">Continue to Devices &rarr;</button>
      </div>
    `;
    document.getElementById('access-tracker').innerHTML = deviceTracker(a.status, a.statusInfo);

    document.getElementById('access-refresh-btn').addEventListener('click', async () => {
      const r = await Api.getAccess(a.id);
      if (r.ok) wizard.setAccess(r.data);
    });
    document.getElementById('access-delete-btn').addEventListener('click', async () => {
      if (!confirm('Delete this access? The device loses its grant.')) return;
      const r = await Api.deleteAccess(a.id);
      if (r.status === 204 || r.ok) {
        window.showToast('Access deleted.', 'success');
        stopPolling();
        wizard.setNetwork(wizard.network); // keeps network, clears access
      } else {
        setSt('access-action-status', 'Error: ' + (r.data.message || r.data.error || 'HTTP ' + r.status), false);
      }
    });
    document.getElementById('access-continue-btn').addEventListener('click', () => nav.goTo('devices'));

    startAccessPolling(a);
  }

  function stopPolling() { if (poller) { poller.stop(); poller = null; } }

  function startAccessPolling(a) {
    stopPolling();
    if (a.status === 'GRANTED' || a.status === 'DENIED') return;
    poller = startPolling(async () => {
      const r = await Api.getAccess(a.id);
      if (!r.ok) return 'fast';
      Object.assign(a, r.data);
      const trackerEl = document.getElementById('access-tracker');
      if (trackerEl) trackerEl.innerHTML = deviceTracker(a.status, a.statusInfo);
      return (a.status === 'GRANTED' || a.status === 'DENIED') ? 'stop' : 'fast';
    }, { fastMs: 5000, slowMs: 20000 });
  }

  return {
    activate() { render(); },
    deactivate() { stopPolling(); }
  };
}
