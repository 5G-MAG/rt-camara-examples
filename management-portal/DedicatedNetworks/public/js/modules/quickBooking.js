/*
License: 5G-MAG Public License (v1.0)
Author: Jordi Joan Gimenez
Copyright: (C) 2026 5G-MAG Association

For full license terms please see the LICENSE file distributed with this
program. If this file is missing then the license can be retrieved from
https://hub.5g-mag.com/Getting-Started/OFFICIAL_5G-MAG_Public_License_v1.0.pdf

Quick Booking — the one-click "create network + access in a single form"
shortcut, kept alongside Guided Setup per user request. Shares wizard state:
a network/access booked here shows up already unlocked in the Access/Devices
tabs.
*/

import { Api, resolveProfileName } from './api.js';
import { fmtTp, fmtDate, pad, networkTracker, deviceTracker, drow } from './uiCommon.js';
import { wizard } from './wizard.js';
import { startPolling } from './polling.js';

export function initQuickBooking() {
  const map = L.map('home-map').setView([46.2, 6.15], 10);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OpenStreetMap contributors', maxZoom: 19 }).addTo(map);
  L.Control.geocoder({ defaultMarkGeocode: false, placeholder: 'Search place…' })
    .on('markgeocode', e => { setLocation(e.geocode.center.lat, e.geocode.center.lng); map.setView(e.geocode.center, 13); })
    .addTo(map);

  (function addLocateControl() {
    const LocateControl = L.Control.extend({
      options: { position: 'topright' },
      onAdd() {
        const btn = L.DomUtil.create('button', 'leaflet-locate-btn');
        btn.innerHTML = '&#128205; Use My Location';
        L.DomEvent.disableClickPropagation(btn);
        L.DomEvent.on(btn, 'click', () => {
          if (!navigator.geolocation) return;
          btn.textContent = 'Locating…'; btn.disabled = true;
          navigator.geolocation.getCurrentPosition(pos => {
            btn.innerHTML = '&#128205; Use My Location'; btn.disabled = false;
            setLocation(pos.coords.latitude, pos.coords.longitude);
            map.setView([pos.coords.latitude, pos.coords.longitude], 13);
          }, () => { btn.innerHTML = '&#128205; Use My Location'; btn.disabled = false; showStatus('Could not get your location. Click on the map instead.', false); });
        });
        return btn;
      }
    });
    new LocateControl().addTo(map);
  }());

  let marker = null, selectedArea = null, selectedProfileId = null, selectedQos = null;
  let createdNetworkId = null, createdAccessId = null, netPoller = null, accPoller = null, remainTimer = null;

  function setLocation(lat, lng) {
    const latlng = L.latLng(lat, lng);
    if (marker) marker.setLatLng(latlng);
    else { marker = L.marker(latlng, { draggable: true }).addTo(map); marker.on('dragend', () => { const p = marker.getLatLng(); setLocation(p.lat, p.lng); }); }
    map.panTo(latlng);
    document.getElementById('home-location-display').textContent = `Lat: ${lat.toFixed(6)}  Lng: ${lng.toFixed(6)}`;
    searchAreas(lat, lng);
  }

  async function searchAreas(lat, lng) {
    const list = document.getElementById('home-profiles-list');
    list.innerHTML = '<p class="empty-hint">Loading profiles…</p>';
    selectedArea = null; selectedProfileId = null; selectedQos = null;
    document.getElementById('home-qos-section').hidden = true;
    updateObtainBtn();
    const r = await Api.retrieveAreas({ atLocation: { latitude: +lat.toFixed(6), longitude: +lng.toFixed(6) } });
    if (!r.ok) { list.innerHTML = '<p class="empty-hint">Could not load areas.</p>'; return; }
    const areas = Array.isArray(r.data) ? r.data : [r.data];
    const profileMap = {};
    areas.forEach(area => (area.networkProfiles || []).forEach(pid => { if (!profileMap[pid]) profileMap[pid] = area; }));
    const profileIds = Object.keys(profileMap);
    if (!profileIds.length) { list.innerHTML = '<p class="empty-hint">No network profiles available at this location.</p>'; return; }
    list.innerHTML = '<p class="empty-hint">Loading profile details…</p>';
    const results = await Promise.all(profileIds.map(async pid => {
      const pr = await Api.getNetworkProfile(pid);
      return { id: pid, area: profileMap[pid], profile: pr.ok ? pr.data : null };
    }));
    list.innerHTML = '';
    results.forEach(item => {
      const p = item.profile;
      const name = (p && p.name) ? p.name : item.id.slice(0, 12) + '…';
      let detail = '';
      if (p) {
        if (p.aggregatedDlThroughput) detail += 'DL: ' + fmtTp(p.aggregatedDlThroughput) + '  ';
        if (p.aggregatedUlThroughput) detail += 'UL: ' + fmtTp(p.aggregatedUlThroughput);
        if (p.maxNumberOfDevices != null) detail += (detail ? '  ' : '') + 'Max devices: ' + p.maxNumberOfDevices;
      }
      const el = document.createElement('div');
      el.className = 'form-row list-row-clickable';
      el.innerHTML = `<span class="field-name">${name}</span>${detail ? `<div class="field-key">${detail}</div>` : ''}`;
      el.addEventListener('click', () => {
        list.querySelectorAll('.list-row-clickable').forEach(x => x.classList.remove('active'));
        el.classList.add('active');
        selectedProfileId = item.id; selectedArea = item.area; selectedQos = null;
        renderQosProfiles(item.profile);
        updateObtainBtn();
      });
      list.appendChild(el);
    });
  }

  function renderQosProfiles(profile) {
    const section = document.getElementById('home-qos-section');
    const list = document.getElementById('home-qos-list');
    const profiles = (profile && profile.qosProfiles) ? profile.qosProfiles.slice() : [];
    const def = profile && profile.defaultQosProfile;
    if (!profiles.length && !def) { section.hidden = true; return; }
    if (def && profiles.indexOf(def) === -1) profiles.unshift(def);
    section.hidden = false;
    list.innerHTML = '';
    profiles.forEach(qname => {
      const isDefault = qname === def;
      const el = document.createElement('div');
      el.className = 'form-row list-row-clickable' + (isDefault ? ' active' : '');
      el.innerHTML = `<span class="field-name">${qname}</span>${isDefault ? ' <span class="badge badge-success">default</span>' : ''}`;
      if (isDefault) selectedQos = qname;
      el.addEventListener('click', () => { list.querySelectorAll('.list-row-clickable').forEach(x => x.classList.remove('active')); el.classList.add('active'); selectedQos = qname; });
      list.appendChild(el);
    });
  }

  function updateObtainBtn() {
    const phone = document.getElementById('home-phone').value.trim();
    const until = document.getElementById('home-until').value;
    document.getElementById('home-obtain-btn').disabled = !(selectedProfileId && selectedArea && phone && until);
  }
  function showStatus(msg, ok) {
    const el = document.getElementById('home-status');
    el.textContent = msg;
    el.classList.remove('status-success', 'status-error');
    el.classList.add(ok ? 'status-success' : 'status-error');
    el.hidden = false;
  }
  function hideStatus() { document.getElementById('home-status').hidden = true; }

  function fmtCountdown(ms) {
    const d = Math.floor(ms / 86400000), h = Math.floor((ms % 86400000) / 3600000), m = Math.floor((ms % 3600000) / 60000), s = Math.floor((ms % 60000) / 1000);
    return (d ? d + 'd ' : '') + (h ? h + 'h ' : '') + pad(m) + 'm ' + pad(s) + 's';
  }

  function setCountdown(el, text, variant) { el.textContent = text; el.className = 'countdown-' + variant; }
  function updateRemaining(status, startIso, endIso) {
    const el = document.getElementById('home-net-remaining'); if (!el) return;
    const now = new Date();
    if (status === 'REQUESTED' || status === 'RESERVED') {
      const toStart = startIso ? new Date(startIso) - now : -1;
      setCountdown(el, (!startIso || isNaN(toStart) || toStart <= 0) ? 'Awaiting activation…' : 'Starts in ' + fmtCountdown(toStart), 'pending');
      return;
    }
    if (status === 'TERMINATED') { setCountdown(el, 'Terminated', 'muted'); if (remainTimer) { clearInterval(remainTimer); remainTimer = null; } return; }
    if (status !== 'ACTIVATED' || !endIso) { setCountdown(el, '—', 'muted'); return; }
    const diff = new Date(endIso) - now;
    if (isNaN(diff) || diff <= 0) { setCountdown(el, 'Expired', 'expired'); if (remainTimer) { clearInterval(remainTimer); remainTimer = null; } return; }
    setCountdown(el, 'Remaining: ' + fmtCountdown(diff), 'active');
  }

  function renderNetworkCard(net) {
    const el = document.getElementById('home-network-card');
    if (remainTimer) { clearInterval(remainTimer); remainTimer = null; }
    if (!net) { el.innerHTML = ''; return; }
    el.innerHTML = '<div class="card-title">Dedicated Network</div>'
      + drow('Network ID', `<span class="field-key">${net.id || '—'}</span>`)
      + networkTracker(net.status)
      + (net.serviceTime ? drow('Valid until', `${fmtDate(net.serviceTime.end)} &mdash; <span id="home-net-remaining"></span>`) : '')
      + `<div class="toolbar" style="justify-content:flex-start;"><button class="btn btn-danger btn-sm" id="home-del-net-btn" ${net.status === 'TERMINATED' ? 'disabled' : ''}>Delete Network</button></div>`;
    if (net.serviceTime) { updateRemaining(net.status, net.serviceTime.start, net.serviceTime.end); remainTimer = setInterval(() => updateRemaining(net.status, net.serviceTime.start, net.serviceTime.end), 1000); }
    const btn = document.getElementById('home-del-net-btn');
    if (btn && net.status !== 'TERMINATED') {
      btn.addEventListener('click', async () => {
        btn.textContent = 'Deleting…'; btn.disabled = true;
        const r = await Api.deleteNetwork(net.id);
        if (r.ok || r.status === 404) {
          stopPolling(); createdNetworkId = null; createdAccessId = null;
          document.getElementById('home-cards-row').hidden = true;
          showStatus('Network deleted.', true);
        } else { btn.textContent = 'Delete Network'; btn.disabled = false; }
      });
    }
  }

  function renderAccessCard(acc) {
    const el = document.getElementById('home-access-card');
    if (!acc) { el.innerHTML = ''; return; }
    const phone = (acc.device && (acc.device.phoneNumber || acc.device.networkAccessIdentifier)) || '—';
    el.innerHTML = '<div class="card-title">Device Access</div>'
      + drow('Access ID', `<span class="field-key">${acc.id || '—'}</span>`)
      + drow('Phone Number', phone)
      + deviceTracker(acc.status, acc.statusInfo)
      + (acc.defaultQosProfile ? drow('QoS Profile', `<span class="badge badge-success">${acc.defaultQosProfile}</span>`) : '')
      + '<div class="toolbar" style="justify-content:flex-start;"><button class="btn btn-danger btn-sm" id="home-del-acc-btn">Delete Access</button></div>';
    const btn = document.getElementById('home-del-acc-btn');
    if (btn) btn.addEventListener('click', async () => {
      btn.textContent = 'Deleting…'; btn.disabled = true;
      const r = await Api.deleteAccess(acc.id);
      if (r.ok || r.status === 404) { if (accPoller) { accPoller.stop(); accPoller = null; } createdAccessId = null; renderAccessCard(null); }
      else { btn.textContent = 'Delete Access'; btn.disabled = false; }
    });
  }

  function stopPolling() {
    if (netPoller) { netPoller.stop(); netPoller = null; }
    if (accPoller) { accPoller.stop(); accPoller = null; }
    if (remainTimer) { clearInterval(remainTimer); remainTimer = null; }
  }

  function startResultPolling(netId, accId) {
    stopPolling();
    let netEverActivated = false;
    netPoller = startPolling(async () => {
      const r = await Api.getNetwork(netId);
      if (!r.ok) return 'fast';
      const wasActivated = netEverActivated;
      if (r.data.status === 'ACTIVATED') { netEverActivated = true; if (!wasActivated) window.showToast('Your dedicated network is now ACTIVATED.', 'success'); }
      renderNetworkCard(r.data);
      wizard.setNetwork(r.data);
      if (r.data.status === 'TERMINATED') return 'stop';
      return r.data.status === 'ACTIVATED' ? 'slow' : 'fast';
    }, { fastMs: 5000, slowMs: 30000 });
    if (accId) {
      accPoller = startPolling(async () => {
        const r = await Api.getAccess(accId);
        if (!r.ok) return 'fast';
        renderAccessCard(r.data);
        wizard.setAccess(r.data);
        return (r.data.status === 'GRANTED' || r.data.status === 'DENIED') ? 'stop' : 'fast';
      }, { fastMs: 5000, slowMs: 30000 });
    }
  }

  map.on('click', e => setLocation(e.latlng.lat, e.latlng.lng));
  ['home-phone', 'home-until'].forEach(id => { document.getElementById(id).addEventListener('input', updateObtainBtn); document.getElementById(id).addEventListener('change', updateObtainBtn); });

  // Default "until" = +1h
  (function () {
    const d = new Date(Date.now() + 3600000);
    document.getElementById('home-until').value = d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }());

  document.getElementById('home-obtain-btn').addEventListener('click', async function () {
    const btn = this;
    if (!selectedProfileId || !selectedArea) { showStatus('Please select a network profile.', false); return; }
    const phone = document.getElementById('home-phone').value.trim();
    if (!phone) { showStatus('Please enter a phone number.', false); return; }
    const untilVal = document.getElementById('home-until').value;
    if (!untilVal) { showStatus('Please set the "until" time.', false); return; }
    const endDt = new Date(untilVal), startDt = new Date();
    if (endDt <= startDt) { showStatus('End time must be in the future.', false); return; }

    btn.textContent = 'Creating network…'; btn.disabled = true;
    hideStatus(); stopPolling();
    wizard.setArea(selectedArea);

    const netR = await Api.createNetwork({ networkProfileId: selectedProfileId, serviceAreaId: selectedArea.id, serviceTime: { start: startDt.toISOString(), end: endDt.toISOString() } });
    if (!netR.ok) {
      btn.textContent = 'Obtain Connectivity Quality NOW'; btn.disabled = false;
      showStatus('Network creation failed (HTTP ' + netR.status + '): ' + (netR.data.message || netR.data.error || 'Unknown error'), false);
      return;
    }
    createdNetworkId = netR.data.id;
    document.getElementById('home-cards-row').hidden = false;
    renderNetworkCard(netR.data); renderAccessCard(null);
    wizard.setNetwork(netR.data);

    btn.textContent = 'Creating access…';
    const accBody = { networkId: netR.data.id, device: { phoneNumber: phone } };
    if (selectedQos) { accBody.qosProfiles = [selectedQos]; accBody.defaultQosProfile = selectedQos; }
    const accR = await Api.createAccess(accBody);
    btn.textContent = 'Obtain Connectivity Quality NOW'; btn.disabled = false;
    if (!accR.ok) {
      showStatus('Network created but access failed (HTTP ' + accR.status + '): ' + (accR.data.message || accR.data.error || 'Unknown error'), false);
      startResultPolling(createdNetworkId, null);
      return;
    }
    createdAccessId = accR.data.id;
    renderAccessCard(accR.data);
    wizard.setAccess(accR.data);
    showStatus('Network and access created successfully.', true);
    startResultPolling(createdNetworkId, createdAccessId);
  });

  // Try geolocation on load
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(pos => { setLocation(pos.coords.latitude, pos.coords.longitude); map.setView([pos.coords.latitude, pos.coords.longitude], 13); });
  }

  return {
    activate() { setTimeout(() => map.invalidateSize(), 50); },
    deactivate() {}
  };
}
