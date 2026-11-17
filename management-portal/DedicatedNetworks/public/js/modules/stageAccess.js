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
import { setSt, clrSt, escapeHtml, deviceTracker, drow, statusBadge, plural } from './uiCommon.js';
import { wizard } from './wizard.js';
import { startPolling } from './polling.js';
import { renderCallbackConfig } from './callbackConfig.js';
import { loadPool, addToPool, toApiDevice, identifierLine, matchesApiDevice, parseDeviceCsv, PHONE_RE } from './devicePool.js';
import { eventRef, mountCallbackPanel, subscribeCallbacks } from './callbackLog.js';

export function initStageAccess(nav) {
  let poller = null;

  mountCallbackPanel(document.getElementById('access-callbacks'), 'accesses');
  subscribeCallbacks(ev => {
    const { accessId } = eventRef(ev);
    if (poller && accessId && wizard.access && accessId === wizard.access.id) poller.now();
  });

  wizard.onChange(() => { if (!document.getElementById('tab-access').hidden) render(); });

  let networks = [];              // every network of this account, for the left menu
  let existingAccesses = [];      // accesses on the selected network
  const ticked = new Set();       // pool device ids ticked for the next create

  // Same local nickname the Network tab shows, else the API name, else a short id.
  function netName(n) {
    let nick = '';
    try { nick = JSON.parse(localStorage.getItem('dn_network_nicknames') || '{}')[n.id] || ''; } catch (_) {}
    return nick || n.name || n.id.slice(0, 8);
  }

  // ── Left menu: all networks ──
  document.getElementById('load-access-networks-btn').addEventListener('click', loadNetworks);
  async function loadNetworks() {
    clrSt('access-networks-status');
    const r = await Api.listNetworks();
    if (!r.ok) { setSt('access-networks-status', 'HTTP ' + r.status + ': ' + (r.data.message || r.data.error || 'Error'), false); return; }
    networks = Array.isArray(r.data) ? r.data : [r.data];
    setSt('access-networks-status', plural(networks.length, 'network'), true);
    paintNetworks();
  }
  function paintNetworks() {
    const list = document.getElementById('access-networks-list');
    list.innerHTML = '';
    if (!networks.length) { list.innerHTML = '<p class="empty-hint">No networks found.</p>'; return; }
    networks.forEach(n => {
      const el = document.createElement('div'); el.className = 'form-row list-row-clickable';
      if (wizard.network && wizard.network.id === n.id) el.classList.add('active');
      el.innerHTML = `<span class="field-name">${escapeHtml(netName(n))}</span> ${statusBadge(n.status)}`
        + `<div class="field-key">${n.id}</div>`;
      el.addEventListener('click', () => selectNetwork(n));
      list.appendChild(el);
    });
  }
  async function selectNetwork(n) {
    if (wizard.network && wizard.network.id === n.id) return;
    if (!wizard.confirmAndResetFrom('network')) return;
    // Keep the Network tab consistent: its area is the one this network belongs to.
    if (n.serviceAreaId && (!wizard.area || wizard.area.id !== n.serviceAreaId)) {
      const r = await Api.getArea(n.serviceAreaId);
      if (r.ok) wizard.setArea(r.data);
    }
    wizard.setNetwork(n);
  }

  async function render() {
    paintNetworks();
    const network = wizard.network;
    const accessesPanel = document.getElementById('access-accesses-panel');
    const mainWrap = document.getElementById('access-main-wrap');
    const emptyWrap = document.getElementById('access-empty-wrap');
    if (!network) {
      stopPolling();
      existingAccesses = [];
      accessesPanel.hidden = true; mainWrap.hidden = true; emptyWrap.hidden = false;
      return;
    }
    emptyWrap.hidden = true; accessesPanel.hidden = false; mainWrap.hidden = false;
    document.getElementById('access-card-title').textContent = 'Access on ' + netName(network);
    await loadAccessesList();
    if (wizard.network !== network) return;   // another network was picked meanwhile
    if (wizard.access) renderAccessDetail(wizard.access);
    else renderCreateForm();
  }

  document.getElementById('load-accesses-btn').addEventListener('click', async () => { await loadAccessesList(); paintDeviceList(); });
  async function loadAccessesList() {
    const list = document.getElementById('accesses-list');
    list.innerHTML = ''; clrSt('accesses-status');
    existingAccesses = [];
    const r = await Api.listAccesses(wizard.network.id);
    if (!r.ok) { setSt('accesses-status', 'HTTP ' + r.status + ': ' + (r.data.message || r.data.error || 'Error'), false); return; }
    const accesses = Array.isArray(r.data) ? r.data : [r.data];
    existingAccesses = accesses;
    setSt('accesses-status', plural(accesses.length, 'access', 'accesses') + ' — one per device', true);
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

  // ── Create form: pick devices, create one access per device (this sandbox's hard constraint) ──
  function accessFor(poolDev) { return existingAccesses.find(a => matchesApiDevice(poolDev, a.device)); }

  async function renderCreateForm() {
    stopPolling();
    const network = wizard.network;
    const body = document.getElementById('access-main-body');
    body.innerHTML = `
      <div class="section-panel">
        <div class="section-panel-title">Devices</div>
        <p class="form-hint">Tick the devices that should get access. Each device gets its own access, because this sandbox takes one device per access.</p>
        <div id="access-device-list"></div>
      </div>
      <div class="section-panel">
        <div class="section-panel-title">Add a device</div>
        <div class="form-row"><label class="form-label" for="access-quick-phone">Phone number</label><input type="tel" id="access-quick-phone" placeholder="+99971530264"/></div>
        <div class="form-row"><label class="form-label" for="access-quick-name">Name <span class="form-hint" style="display:inline;">&middot; optional</span></label><input type="text" id="access-quick-name" placeholder="e.g. Camera 1"/></div>
        <div class="toolbar" style="justify-content:flex-start;">
          <button class="btn btn-ghost btn-sm" id="access-quick-add-btn">Add device</button>
        </div>
        <p class="status-line" id="access-quick-status"></p>
      </div>
      <div class="section-panel">
        <div class="section-panel-title">Add several devices from a CSV file</div>
        <p class="form-hint">One device per line: the phone number, then an optional name. A first line starting with &ldquo;phone&rdquo; is skipped.</p>
        <div class="form-row"><label class="form-label" for="access-csv-input">CSV file</label><input type="file" id="access-csv-input" accept=".csv,text/csv,text/plain"/></div>
        <p class="status-line" id="access-csv-status"></p>
      </div>
      <div class="section-panel">
        <div class="section-panel-title">QoS Profile</div>
        <p class="empty-hint" id="access-qos-loading">Loading available QoS profiles…</p>
        <div id="access-qos-picker" hidden></div>
      </div>
      <div id="access-callback-config"></div>
      <p class="status-line" id="access-form-status"></p>
      <div id="access-create-results"></div>
      <div class="toolbar" style="justify-content:flex-start;">
        <button class="btn btn-primary" id="access-create-btn">Create access</button>
      </div>
    `;
    const callbackCfg = renderCallbackConfig(document.getElementById('access-callback-config'), 'access');
    paintDeviceList();

    document.getElementById('access-quick-add-btn').addEventListener('click', () => {
      const phone = document.getElementById('access-quick-phone').value.trim();
      const name = document.getElementById('access-quick-name').value.trim();
      clrSt('access-quick-status');
      if (!phone) { setSt('access-quick-status', 'Enter the phone number.', false); return; }
      if (!PHONE_RE.test(phone)) { setSt('access-quick-status', 'Use international format with a leading +, e.g. +99971530264.', false); return; }
      const pool = loadPool();
      const known = pool.find(d => d.phone === phone);
      if (known) { setSt('access-quick-status', 'This device already exists; it is ticked below.', false); ticked.add(known.id); paintDeviceList(); return; }
      ticked.add(addToPool(pool, { name: name || phone, phone }).id);
      ['access-quick-phone', 'access-quick-name'].forEach(id => { document.getElementById(id).value = ''; });
      setSt('access-quick-status', 'Device added.', true);
      paintDeviceList();
    });

    document.getElementById('access-csv-input').addEventListener('change', async function () {
      const file = this.files && this.files[0];
      clrSt('access-csv-status');
      if (!file) return;
      let text;
      try { text = await file.text(); } catch (_) { setSt('access-csv-status', 'The file could not be read.', false); return; }
      const { rows, errors, duplicates } = parseDeviceCsv(text);
      const pool = loadPool();
      let added = 0, known = 0;
      rows.forEach(r => {
        const have = pool.find(d => d.phone === r.phone);
        if (have) { known++; ticked.add(have.id); return; }
        ticked.add(addToPool(pool, { name: r.name || r.phone, phone: r.phone }).id);
        added++;
      });
      this.value = '';
      const parts = [added + ' added'];
      if (known) parts.push(known + ' already existed');
      if (duplicates) parts.push(duplicates + ' repeated in the file');
      if (errors.length) parts.push(errors.length + ' not a valid phone number (' + errors.slice(0, 3).join('; ') + (errors.length > 3 ? '; …' : '') + ')');
      setSt('access-csv-status', parts.join(', ') + '.', errors.length === 0 && rows.length > 0);
      paintDeviceList();
    });

    // Resolve the QoS options this network actually offers.
    let qosOptions = [], defaultQos = null;
    if (network.networkProfileId) {
      const r = await Api.getNetworkProfile(network.networkProfileId);
      if (r.ok) { qosOptions = r.data.qosProfiles || []; defaultQos = r.data.defaultQosProfile || null; }
    } else if (network.qosProfileName) {
      qosOptions = [network.qosProfileName]; defaultQos = network.qosProfileName;
    }
    if (wizard.network !== network || wizard.access) return;   // the page moved on while loading
    document.getElementById('access-qos-loading').hidden = true;
    const picker = document.getElementById('access-qos-picker');
    picker.hidden = false;
    if (!qosOptions.length) {
      picker.innerHTML = '<p class="empty-hint">No QoS profiles on this network &mdash; the access will inherit the network default.</p>';
    } else {
      picker.innerHTML = qosOptions.map(q => `
        <div class="form-row">
          <label><input type="checkbox" class="access-qos-check" value="${escapeHtml(q)}" ${q === defaultQos ? 'checked' : ''}/> ${escapeHtml(q)}${q === defaultQos ? ' <span class="form-hint" style="display:inline;">&middot; network default</span>' : ''}</label>
          &nbsp;&nbsp;
          <label><input type="radio" name="access-qos-default" class="access-qos-default-radio" value="${escapeHtml(q)}" ${q === defaultQos ? 'checked' : ''}/> set as default</label>
        </div>`).join('')
        + '<p class="form-hint">Check the profiles these accesses may use; pick one radio button as the default. Leave all unchecked to inherit the network default.</p>';
      picker.querySelectorAll('.access-qos-check').forEach(cb => cb.addEventListener('change', () => {
        const radio = cb.closest('.form-row').querySelector('.access-qos-default-radio');
        radio.disabled = !cb.checked;
        if (!cb.checked && radio.checked) { const firstChecked = picker.querySelector('.access-qos-check:checked'); if (firstChecked) firstChecked.closest('.form-row').querySelector('.access-qos-default-radio').checked = true; }
      }));
    }

    document.getElementById('access-create-btn').addEventListener('click', async function () {
      const btn = this;
      clrSt('access-form-status');
      const results = document.getElementById('access-create-results'); results.innerHTML = '';
      const chosen = loadPool().filter(d => ticked.has(d.id) && !accessFor(d));
      if (!chosen.length) { setSt('access-form-status', 'Tick at least one device without an access.', false); return; }
      const checked = Array.from(picker.querySelectorAll('.access-qos-check:checked')).map(cb => cb.value);
      const defaultRadio = picker.querySelector('.access-qos-default-radio:checked');
      const common = { networkId: network.id, ...callbackCfg.getValue() };
      if (checked.length) { common.qosProfiles = checked; common.defaultQosProfile = (defaultRadio && defaultRadio.value) || checked[0]; }
      btn.disabled = true;
      const made = [], failed = [];
      for (let i = 0; i < chosen.length; i++) {
        btn.textContent = 'Creating ' + (i + 1) + ' of ' + chosen.length + '…';
        const r = await Api.createAccess({ ...common, device: toApiDevice(chosen[i]) });
        if (r.ok) { made.push(r.data); ticked.delete(chosen[i].id); }
        else failed.push(`${chosen[i].phone || chosen[i].name}: HTTP ${r.status} ${r.data.message || r.data.error || 'Error'}`);
      }
      btn.disabled = false; btn.textContent = createLabel();
      if (made.length === 1 && !failed.length) { window.showToast('Access created.', 'success'); wizard.setAccess(made[0]); return; }
      await loadAccessesList();
      paintDeviceList();
      if (made.length) window.showToast(plural(made.length, 'access', 'accesses') + ' created.', 'success');
      setSt('access-form-status', made.length + ' created, ' + failed.length + ' failed.', failed.length === 0);
      if (failed.length) results.innerHTML = failed.map(f => `<p class="form-hint">${escapeHtml(f)}</p>`).join('');
    });
    document.getElementById('access-create-btn').textContent = createLabel();
  }

  function createLabel() {
    const n = loadPool().filter(d => ticked.has(d.id) && !accessFor(d)).length;
    return n > 1 ? 'Create ' + n + ' accesses' : 'Create access';
  }

  function paintDeviceList() {
    const el = document.getElementById('access-device-list');
    if (!el) return;
    const pool = loadPool();
    if (!pool.length) { el.innerHTML = '<p class="empty-hint">No devices yet &mdash; add one below.</p>'; return; }
    el.innerHTML = pool.map(d => {
      const a = accessFor(d);
      return `<div class="form-row"><label><input type="checkbox" class="access-device-check" value="${d.id}" ${a ? 'disabled' : ticked.has(d.id) ? 'checked' : ''}/> `
        + `${escapeHtml(d.name || d.phone || 'device')} <span class="field-key">${identifierLine(d)}</span></label>`
        + (a ? ` ${statusBadge(a.status)} <span class="form-hint" style="display:inline;">has an access on this network</span>` : '') + '</div>';
    }).join('');
    el.querySelectorAll('.access-device-check').forEach(cb => cb.addEventListener('change', () => {
      if (cb.checked) ticked.add(cb.value); else ticked.delete(cb.value);
      const btn = document.getElementById('access-create-btn'); if (btn) btn.textContent = createLabel();
    }));
    const btn = document.getElementById('access-create-btn'); if (btn) btn.textContent = createLabel();
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
      ${(a.qosProfiles && a.qosProfiles.length) ? drow('QoS Profiles', a.qosProfiles.map(q => `<span class="badge ${q === a.defaultQosProfile ? 'badge-success' : 'badge-neutral'}">${escapeHtml(q)}${q === a.defaultQosProfile ? ' · default' : ''}</span>`).join(' ')) : ''}
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
    // DENIED is final; GRANTED can still become DENIED, so keep watching it.
    if (a.status === 'DENIED') return;
    poller = startPolling(async () => {
      const r = await Api.getAccess(a.id);
      if (!r.ok) return 'fast';
      Object.assign(a, r.data);
      const trackerEl = document.getElementById('access-tracker');
      if (trackerEl) trackerEl.innerHTML = deviceTracker(a.status, a.statusInfo);
      return a.status === 'DENIED' ? 'stop' : a.status === 'GRANTED' ? 'slow' : 'fast';
    }, { fastMs: 5000, slowMs: 20000 });
  }

  return {
    activate() { loadNetworks(); render(); },
    deactivate() { stopPolling(); }
  };
}
