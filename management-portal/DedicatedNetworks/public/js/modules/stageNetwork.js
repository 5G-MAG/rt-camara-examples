/*
License: 5G-MAG Public License (v1.0)
Author: Jordi Joan Gimenez
Copyright: (C) 2026 5G-MAG Association

For full license terms please see the LICENSE file distributed with this
program. If this file is missing then the license can be retrieved from
https://hub.5g-mag.com/Getting-Started/OFFICIAL_5G-MAG_Public_License_v1.0.pdf

Stage 2 — Network. Create form exposes the full CreateNetwork body (name,
networkProfileId XOR qosProfileName, serviceTime, callback config) scoped to
the area picked in Stage 1; detail view shows the full lifecycle tracker.
*/

import { Api, resolveProfileName } from './api.js';
import {
  setSt, clrSt, fmtTp, fmtDate, fmtDuration, drow, escapeHtml, pad,
  networkTracker, statusBadge
} from './uiCommon.js';
import { wizard } from './wizard.js';
import { startPolling } from './polling.js';
import { renderCallbackConfig } from './callbackConfig.js';

function loadJSON(key, fallback) { try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; } catch (_) { return fallback; } }
function saveJSON(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); } catch (_) {} }

export function initStageNetwork(nav) {
  let poller = null;
  let miniMap = null;
  const nicknames = loadJSON('dn_network_nicknames', {}); // networkId -> local nickname

  function displayName(n) { return (n && (nicknames[n.id] || n.name)) || (n && n.id) || 'Unnamed'; }

  wizard.onChange(() => { if (!document.getElementById('tab-network').hidden) render(); });

  function render() {
    const locked = document.getElementById('network-locked-msg');
    const body = document.getElementById('network-body');
    const mainWrap = document.getElementById('network-main-wrap');
    if (!wizard.area) { locked.hidden = false; body.hidden = true; mainWrap.hidden = true; return; }
    locked.hidden = true; body.hidden = false; mainWrap.hidden = false;
    renderAreaChip();
    if (wizard.network) renderNetworkDetail(wizard.network);
    else renderCreateForm();
  }

  function renderAreaChip() {
    const chip = document.getElementById('network-area-chip');
    const a = wizard.area;
    chip.innerHTML = `<span class="field-name">${escapeHtml(a.name || 'Unnamed area')}</span>`
      + (a.id ? `<div class="field-key">${a.id}</div>` : '');
  }
  document.getElementById('network-change-area-btn').addEventListener('click', () => nav.goTo('areas'));

  // ── Existing networks list (reference + "select an existing one instead") ──
  document.getElementById('load-networks-btn').addEventListener('click', loadNetworksList);
  async function loadNetworksList() {
    const list = document.getElementById('networks-list');
    list.innerHTML = ''; clrSt('networks-status');
    const r = await Api.listNetworks();
    if (!r.ok) { setSt('networks-status', 'HTTP ' + r.status + ': ' + (r.data.message || r.data.error || 'Error'), false); return; }
    const networks = Array.isArray(r.data) ? r.data : [r.data];
    setSt('networks-status', networks.length + ' network(s)', true);
    if (!networks.length) { list.innerHTML = '<p class="empty-hint">No networks found.</p>'; return; }
    networks.forEach(n => {
      const el = document.createElement('div'); el.className = 'form-row list-row-clickable';
      el.dataset.netId = n.id;
      if (wizard.network && wizard.network.id === n.id) el.classList.add('active');
      el.innerHTML = `<span class="field-name">${escapeHtml(displayName(n))}</span> `
        + `<span class="net-row-badge">${statusBadge(n.status)}</span>`
        + `<div class="field-key">${n.id}</div>`;
      el.addEventListener('click', () => {
        if (!wizard.network || wizard.network.id !== n.id) {
          if (!wizard.confirmAndResetFrom('network')) return;
        }
        wizard.setNetwork(n);
      });
      list.appendChild(el);
    });
  }

  // ── Create form ──
  function renderCreateForm() {
    stopPolling();
    const area = wizard.area;
    const hasProfiles = (area.networkProfiles || []).length > 0;
    const hasQos = (area.qosProfiles || []).length > 0;
    const body = document.getElementById('network-main-body');
    body.innerHTML = `
      <p class="form-hint">Creating a network for area: <strong style="color:var(--text);">${escapeHtml(area.name || area.id)}</strong></p>
      <div id="net-mini-map" style="width:100%;aspect-ratio:16/9;max-height:180px;border-radius:8px;overflow:hidden;border:1px solid var(--border);margin:0.5rem 0 1rem;"></div>
      <div class="form-row">
        <label class="form-label" for="net-name">Name <span class="form-hint" style="display:inline;">(optional)</span></label>
        <input type="text" id="net-name" placeholder="e.g. Press Briefing Network"/>
      </div>
      <div class="section-panel">
        <div class="section-panel-title">Network Profile or QoS Profile &mdash; exactly one required</div>
        <div class="form-row">
          <label><input type="radio" name="net-profmode" value="profile" ${hasProfiles ? 'checked' : ''} ${!hasProfiles ? 'disabled' : ''}/> By Network Profile</label>
          &nbsp;&nbsp;
          <label><input type="radio" name="net-profmode" value="qos" ${!hasProfiles && hasQos ? 'checked' : ''} ${!hasQos ? 'disabled' : ''}/> By QoS Profile</label>
        </div>
        <div id="net-profile-pick" ${hasProfiles ? '' : 'hidden'}>
          <select id="net-profile-select"><option value="">-- Select a network profile --</option></select>
          <div id="net-profile-detail" hidden></div>
        </div>
        <div id="net-qos-pick" ${!hasProfiles && hasQos ? '' : 'hidden'}>
          <select id="net-qos-select"><option value="">-- Select a QoS profile --</option>${(area.qosProfiles || []).map(q => `<option value="${escapeHtml(q)}">${escapeHtml(q)}</option>`).join('')}</select>
        </div>
        ${!hasProfiles && !hasQos ? '<p class="empty-hint">This area exposes neither network profiles nor QoS profiles.</p>' : ''}
      </div>
      <div class="section-panel">
        <div class="section-panel-title">Service Time</div>
        <div class="form-row"><label class="form-label" for="net-start">Start</label><input type="datetime-local" id="net-start"/></div>
        <div class="form-row"><label class="form-label" for="net-end">End</label><input type="datetime-local" id="net-end"/></div>
        <p class="status-line" id="net-duration"></p>
      </div>
      <div id="net-callback-config"></div>
      <p class="status-line" id="net-form-status"></p>
      <div class="toolbar" style="justify-content:flex-start;">
        <button class="btn btn-primary" id="net-create-btn">Create Network</button>
      </div>
    `;

    const callbackCfg = renderCallbackConfig(document.getElementById('net-callback-config'), 'net');
    showAreaNameAndMiniMap(area); // reassure the user which area this is, visually — not just the text line above

    // Default service time: now -> +1h
    const now = new Date(), end = new Date(now.getTime() + 3600000);
    document.getElementById('net-start').value = toLocalInput(now);
    document.getElementById('net-end').value = toLocalInput(end);
    updateDuration();
    ['net-start', 'net-end'].forEach(id => document.getElementById(id).addEventListener('change', updateDuration));
    function updateDuration() {
      const s = document.getElementById('net-start').value, e = document.getElementById('net-end').value;
      const el = document.getElementById('net-duration');
      el.classList.remove('status-success', 'status-error');
      if (!s || !e) { el.textContent = ''; return; }
      const diff = new Date(e) - new Date(s);
      if (diff <= 0) { el.classList.add('status-error'); el.textContent = 'End must be after start.'; return; }
      const h = Math.floor(diff / 3600000), m = Math.floor((diff % 3600000) / 60000);
      el.classList.add('status-success'); el.textContent = 'Duration: ' + (h ? h + 'h ' : '') + m + 'min';
    }

    // Profile picker: populate + show detail on selection
    if (hasProfiles) {
      const sel = document.getElementById('net-profile-select');
      Promise.all(area.networkProfiles.map(async pid => ({ id: pid, name: await resolveProfileName(pid) })))
        .then(list => { sel.innerHTML = '<option value="">-- Select a network profile --</option>' + list.map(p => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join(''); });
      sel.addEventListener('change', async () => {
        const detailEl = document.getElementById('net-profile-detail');
        if (!sel.value) { detailEl.hidden = true; return; }
        detailEl.hidden = false; detailEl.textContent = 'Loading...';
        const r = await Api.getNetworkProfile(sel.value);
        if (!r.ok) { detailEl.textContent = 'Could not load profile details.'; return; }
        const p = r.data;
        let html = '';
        if (p.maxNumberOfDevices != null) html += drow('Max devices', p.maxNumberOfDevices);
        if (p.aggregatedUlThroughput || p.aggregatedDlThroughput) {
          html += drow('Throughput', [
            p.aggregatedUlThroughput ? `↑ ${fmtTp(p.aggregatedUlThroughput)}` : '',
            p.aggregatedDlThroughput ? `↓ ${fmtTp(p.aggregatedDlThroughput)}` : ''
          ].filter(Boolean).join(' &nbsp; '));
        }
        if (p.qosProfiles && p.qosProfiles.length) {
          html += drow('QoS profiles', p.qosProfiles.map(q => `<span class="badge badge-neutral">${escapeHtml(q)}</span>`).join(' '));
        }
        detailEl.innerHTML = html || '<p class="empty-hint">No details available.</p>';
      });
    }

    document.querySelectorAll('input[name="net-profmode"]').forEach(r => r.addEventListener('change', () => {
      const mode = document.querySelector('input[name="net-profmode"]:checked').value;
      document.getElementById('net-profile-pick').hidden = mode !== 'profile';
      document.getElementById('net-qos-pick').hidden = mode !== 'qos';
    }));

    document.getElementById('net-create-btn').addEventListener('click', async function () {
      const btn = this;
      const mode = document.querySelector('input[name="net-profmode"]:checked');
      const profileId = hasProfiles ? document.getElementById('net-profile-select').value : '';
      const qosName = hasQos ? document.getElementById('net-qos-select').value : '';
      const chosenMode = mode ? mode.value : null;
      const startVal = document.getElementById('net-start').value, endVal = document.getElementById('net-end').value;
      clrSt('net-form-status');
      if (!chosenMode || (chosenMode === 'profile' && !profileId) || (chosenMode === 'qos' && !qosName)) {
        setSt('net-form-status', 'Select a network profile or a QoS profile.', false); return;
      }
      if (!startVal || !endVal) { setSt('net-form-status', 'Set start and end time.', false); return; }
      const startDt = new Date(startVal), endDt = new Date(endVal);
      if (endDt <= startDt) { setSt('net-form-status', 'End time must be after start time.', false); return; }

      const reqBody = {
        serviceAreaId: area.id,
        serviceTime: { start: startDt.toISOString(), end: endDt.toISOString() },
        ...(chosenMode === 'profile' ? { networkProfileId: profileId } : { qosProfileName: qosName }),
        ...callbackCfg.getValue()
      };
      const nameVal = document.getElementById('net-name').value.trim();
      if (nameVal) reqBody.name = nameVal;

      btn.textContent = 'Creating…'; btn.disabled = true;
      const r = await Api.createNetwork(reqBody);
      btn.disabled = false; btn.textContent = 'Create Network';
      if (!r.ok) { setSt('net-form-status', 'HTTP ' + r.status + ': ' + (r.data.message || r.data.error || 'Error'), false); return; }
      if (nameVal) { nicknames[r.data.id] = nameVal; saveJSON('dn_network_nicknames', nicknames); }
      window.showToast(`Network created (status: ${r.data.status}).`, 'success');
      wizard.setNetwork(r.data);
      loadNetworksList(); // so the new network shows up without a manual reload
    });
  }

  function toLocalInput(d) {
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }

  // ── Network detail (post-create or selected-from-list) ──
  async function renderNetworkDetail(n) {
    const body = document.getElementById('network-main-body');
    const dn = displayName(n);
    body.innerHTML = `
      <div class="toolbar" style="justify-content:space-between;margin-top:0;">
        <span class="field-name" id="net-detail-name">${escapeHtml(dn)}</span>
        <div>
          <button class="btn btn-ghost btn-sm" id="net-refresh-btn">Refresh</button>
          <button class="btn btn-danger btn-sm" id="net-delete-btn">Delete</button>
        </div>
      </div>
      <div id="net-tracker"></div>
      ${drow('Network ID', `<span class="field-key">${n.id}</span>`)}
      <div class="form-row">
        <label class="form-label">Local Nickname</label>
        <div style="display:flex;gap:0.5rem;">
          <input id="net-nickname-input" type="text" value="${escapeHtml(nicknames[n.id] || '')}" placeholder="Set a local name"/>
          <button id="net-nickname-save" class="btn btn-ghost btn-sm">Save</button>
        </div>
      </div>
      ${n.networkProfileId ? drow('Network Profile', `<span class="badge badge-neutral" id="net-detail-profile-tag" data-profile-id="${n.networkProfileId}" style="cursor:pointer;">${n.networkProfileId.slice(0, 8)}...</span>`) : ''}
      ${n.qosProfileName ? drow('QoS Profile', `<span class="badge badge-success">${escapeHtml(n.qosProfileName)}</span>`) : ''}
      ${n.serviceTime ? drow('Service Time', `${fmtDate(n.serviceTime.start)} &rarr; ${fmtDate(n.serviceTime.end)} (${fmtDuration(n.serviceTime.start, n.serviceTime.end)})<br><span id="net-remaining"></span>`) : ''}
      ${drow('Service Area', `<span id="net-area-name">${n.serviceAreaId ? n.serviceAreaId.slice(0, 8) + '...' : '—'}</span>`)}
      <div id="net-mini-map" style="width:100%;aspect-ratio:16/9;max-height:220px;border-radius:8px;overflow:hidden;border:1px solid var(--border);margin:0.5rem 0 1rem;"></div>
      <p class="status-line" id="net-action-status"></p>
      <div class="toolbar" style="justify-content:flex-start;">
        <button class="btn btn-primary" id="net-continue-btn">Continue to Access &rarr;</button>
      </div>
    `;

    document.getElementById('net-tracker').innerHTML = networkTracker(n.status);

    // Wire every button BEFORE any decorative/async work below (profile name
    // lookup, mini-map) — a failure in that decorative work must never be
    // able to leave the primary "Continue to Access" CTA unwired.
    document.getElementById('net-nickname-save').addEventListener('click', () => {
      const val = document.getElementById('net-nickname-input').value.trim();
      if (val) nicknames[n.id] = val; else delete nicknames[n.id];
      saveJSON('dn_network_nicknames', nicknames);
      document.getElementById('net-detail-name').textContent = displayName(n);
      window.showToast('Nickname saved.', 'success');
    });

    document.getElementById('net-refresh-btn').addEventListener('click', async () => {
      const r = await Api.getNetwork(n.id);
      if (r.ok) wizard.setNetwork(r.data);
    });

    document.getElementById('net-delete-btn').addEventListener('click', async () => {
      if (!confirm(`Delete "${dn}"? This cannot be undone.`)) return;
      const r = await Api.deleteNetwork(n.id);
      if (r.status === 204 || r.ok) {
        window.showToast('Network deleted.', 'success');
        stopPolling();
        wizard.setArea(wizard.area); // keeps area, clears network+access
        loadNetworksList(); // refresh the reference list — it doesn't
                             // otherwise know this network is gone
      } else {
        setSt('net-action-status', 'Error: ' + (r.data.message || r.data.error || 'HTTP ' + r.status), false);
      }
    });

    document.getElementById('net-continue-btn').addEventListener('click', () => nav.goTo('access'));

    // Live countdown + polling (network status can change server-side)
    startNetworkPolling(n);

    // Decorative: profile name lookup + mini-map. Both are defensive against
    // throwing (see showAreaNameAndMiniMap), but kept last regardless.
    if (n.networkProfileId) {
      resolveProfileName(n.networkProfileId).then(name => {
        const tag = document.getElementById('net-detail-profile-tag');
        if (tag) tag.textContent = name;
      });
    }
    if (n.serviceAreaId) {
      const areaR = wizard.area && wizard.area.id === n.serviceAreaId ? { ok: true, data: wizard.area } : await Api.getArea(n.serviceAreaId);
      if (areaR.ok) showAreaNameAndMiniMap(areaR.data);
    }
  }

  // Building the mini-map is decorative — it must never be able to abort the
  // rest of renderNetworkDetail() (and so break the "Continue to Access"
  // button etc.) if Leaflet trips over a not-yet-laid-out, zero-size
  // container. Everything Leaflet-related here is defensive for that reason.
  function showAreaNameAndMiniMap(area) {
    const nameEl = document.getElementById('net-area-name');
    if (nameEl) nameEl.textContent = area.name || area.id || 'Unknown area';
    const mapEl = document.getElementById('net-mini-map');
    if (!mapEl) return;
    try {
      if (miniMap) { try { miniMap.remove(); } catch (_) {} miniMap = null; }
      mapEl.innerHTML = '';
      miniMap = L.map(mapEl, { zoomControl: false, attributionControl: false, dragging: false, scrollWheelZoom: false, keyboard: false });
      miniMap.setView([0, 0], 1); // give Leaflet a valid pixel origin before any fitBounds
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18 }).addTo(miniMap);
      if (area.area) {
        const a = area.area, type = a.areaType && a.areaType.toUpperCase();
        if (type === 'POLYGON') {
          const raw = a.boundary || a.coordinates || a.points || [];
          if (raw.length) {
            const ll = raw.map(c => Array.isArray(c) ? [c[1], c[0]] : [c.latitude, c.longitude]);
            const poly = L.polygon(ll, { color: '#00a0d2', fillColor: '#00a0d2', fillOpacity: 0.2, weight: 2 }).addTo(miniMap);
            miniMap.fitBounds(poly.getBounds(), { padding: [10, 10] });
          }
        } else if (type === 'CIRCLE') {
          const lat = a.center && a.center.latitude, lng = a.center && a.center.longitude;
          if (lat != null && lng != null) {
            const circ = L.circle([lat, lng], { radius: a.radius, color: '#00a0d2', fillColor: '#00a0d2', fillOpacity: 0.2, weight: 2 }).addTo(miniMap);
            miniMap.fitBounds(circ.getBounds(), { padding: [10, 10] });
          }
        }
      }
      setTimeout(() => { try { if (miniMap) miniMap.invalidateSize(); } catch (_) {} }, 200);
    } catch (err) {
      console.error('Mini-map render failed (non-fatal):', err);
    }
  }

  let remainTimer = null;
  function setCountdown(el, text, variant) { el.textContent = text; el.className = 'countdown-' + variant; }
  function updateRemaining(status, startIso, endIso) {
    const el = document.getElementById('net-remaining'); if (!el) return;
    const now = new Date();
    if (status === 'REQUESTED' || status === 'RESERVED') {
      const toStart = startIso ? new Date(startIso) - now : -1;
      setCountdown(el, (!startIso || isNaN(toStart) || toStart <= 0) ? 'Awaiting activation…' : 'Starts in ' + fmtCountdown(toStart), 'pending');
      return;
    }
    if (status === 'TERMINATED') { setCountdown(el, 'Terminated', 'muted'); if (remainTimer) { clearInterval(remainTimer); remainTimer = null; } return; }
    if (status !== 'ACTIVATED') { setCountdown(el, '—', 'muted'); return; }
    if (startIso && new Date(startIso) > now) { setCountdown(el, 'Starts in ' + fmtCountdown(new Date(startIso) - now), 'pending'); return; }
    if (!endIso) { setCountdown(el, '—', 'muted'); return; }
    const diff = new Date(endIso) - now;
    if (isNaN(diff) || diff <= 0) { setCountdown(el, 'Expired', 'expired'); if (remainTimer) { clearInterval(remainTimer); remainTimer = null; } return; }
    setCountdown(el, 'Remaining: ' + fmtCountdown(diff), 'active');
  }
  function fmtCountdown(ms) {
    const d = Math.floor(ms / 86400000), h = Math.floor((ms % 86400000) / 3600000), m = Math.floor((ms % 3600000) / 60000), s = Math.floor((ms % 60000) / 1000);
    return (d ? d + 'd ' : '') + (h ? h + 'h ' : '') + pad(m) + 'm ' + pad(s) + 's';
  }

  function stopPolling() {
    if (poller) { poller.stop(); poller = null; }
    if (remainTimer) { clearInterval(remainTimer); remainTimer = null; }
  }

  // Tear down the mini-map when leaving the stage so it can't fire a
  // pending invalidateSize()/tile callback against a now-hidden (zero-size)
  // container later.
  function destroyMiniMap() {
    if (miniMap) { try { miniMap.remove(); } catch (_) {} miniMap = null; }
  }

  function startNetworkPolling(n) {
    stopPolling();
    if (n.serviceTime && n.serviceTime.end) {
      updateRemaining(n.status, n.serviceTime.start, n.serviceTime.end);
      remainTimer = setInterval(() => updateRemaining(n.status, n.serviceTime.start, n.serviceTime.end), 1000);
    }
    if (n.status === 'TERMINATED') return;
    poller = startPolling(async () => {
      const r = await Api.getNetwork(n.id);
      if (!r.ok) return 'fast';
      const fresh = r.data;
      const wasActivated = n.status === 'ACTIVATED';
      Object.assign(n, fresh);
      if (n.status === 'ACTIVATED' && !wasActivated) {
        window.showToast(`Network "${displayName(n)}" is now ACTIVATED.`, 'success');
      }
      const trackerEl = document.getElementById('net-tracker');
      if (trackerEl) trackerEl.innerHTML = networkTracker(n.status);
      // The sidebar's reference list is a separate, independent DOM tree —
      // update its badge for this network too, in place, so it doesn't go
      // stale while sitting there mid-poll (no reason to rebuild the whole
      // list just for this).
      const rowBadge = document.querySelector(`#networks-list [data-net-id="${n.id}"] .net-row-badge`);
      if (rowBadge) rowBadge.innerHTML = statusBadge(n.status);
      if (n.serviceTime) updateRemaining(n.status, n.serviceTime.start, n.serviceTime.end);
      if (n.status === 'TERMINATED') return 'stop';
      if (n.status === 'ACTIVATED' && n.serviceTime && n.serviceTime.end) {
        const end = new Date(n.serviceTime.end).getTime(), now = Date.now();
        const total = n.serviceTime.start ? end - new Date(n.serviceTime.start).getTime() : 600000;
        const warnThreshold = Math.min(600000, Math.max(60000, total / 2));
        return (end - now) <= warnThreshold ? 'fast' : 'slow';
      }
      return n.status === 'ACTIVATED' ? 'slow' : 'fast';
    }, { fastMs: 5000, slowMs: 30000 });
  }

  return {
    activate() { render(); },
    deactivate() { stopPolling(); destroyMiniMap(); }
  };
}
