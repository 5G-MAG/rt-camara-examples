/*
License: 5G-MAG Public License (v1.0)
Author: Jordi Joan Gimenez
Copyright: (C) 2026 5G-MAG Association

For full license terms please see the LICENSE file distributed with this
program. If this file is missing then the license can be retrieved from
https://hub.5g-mag.com/Getting-Started/OFFICIAL_5G-MAG_Public_License_v1.0.pdf

Stage 1 — Areas. Exercises the full retrieve-service-areas surface: atLocation
(point), overlappingArea/coveringArea (circle or polygon), plus byName /
byNetworkProfileId / byQosProfileName, all combinable.
*/

import { Api, resolveProfileName } from './api.js';
import { setSt, clrSt, fmtTp, drow } from './uiCommon.js';
import { wizard } from './wizard.js';

const COLORS = ['#00a0d2', '#b9770e', '#1e8a4c', '#d9534f', '#7c3aed', '#ec4899', '#14b8a6', '#f97316'];

export function initStageAreas(nav) {
  const map = L.map('map').setView([20, 0], 3);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OpenStreetMap contributors', maxZoom: 19 }).addTo(map);
  L.Control.geocoder({ defaultMarkGeocode: false, placeholder: 'Search place…' })
    .on('markgeocode', e => map.setView(e.geocode.center, 13))
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
            map.setView([pos.coords.latitude, pos.coords.longitude], 13);
            setMode('point');
            drawPoints = [{ lat: pos.coords.latitude, lng: pos.coords.longitude }];
            drawMarkers.push(addDM(drawPoints[0]));
            drawing = false;
            document.getElementById('map').classList.remove('draw-mode');
            document.getElementById('draw-hint').textContent = 'Point placed. Drag to adjust.';
            updateSearchUI();
          }, () => { btn.innerHTML = '&#128205; Use My Location'; btn.disabled = false; });
        });
        return btn;
      }
    });
    new LocateControl().addTo(map);
  }());

  let vizLayers = [], layersByArea = [], currentAreas = [];
  let selectedArea = null;

  function clearViz() { vizLayers.forEach(l => map.removeLayer(l)); vizLayers = []; }

  function makeLabel(name, id, color) {
    return L.divIcon({
      className: '',
      html: `<div style="display:inline-block;background:#fff;border:2px solid ${color};border-radius:6px;padding:4px 10px;white-space:nowrap;cursor:pointer;line-height:1.4;font-size:13px;font-weight:600;color:#111827;box-shadow:0 2px 6px rgba(0,0,0,0.12);">`
        + `<span style="color:#111827;">${name || 'Area'}</span>`
        + (id ? `<span style="display:block;font-size:10px;font-family:monospace;color:${color};margin-top:1px;">${id}</span>` : '')
        + `</div>`,
      iconSize: null, iconAnchor: [0, 0]
    });
  }

  function renderSA(sa, color) {
    const area = sa.area; if (!area || !area.areaType) return [];
    const type = area.areaType.toUpperCase(), icon = makeLabel(sa.name, sa.id, color), layers = [];
    const mkL = (lat, lng) => { const l = L.marker([lat, lng], { icon, interactive: true }); l._sa = sa; l.on('click', () => onLabelClick(l._sa)); return l; };
    if (type === 'CIRCLE') {
      const lat = area.center && area.center.latitude, lng = area.center && area.center.longitude;
      if (lat == null || lng == null || area.radius == null) return [];
      layers.push(L.circle([lat, lng], { radius: area.radius, color, fillColor: color, fillOpacity: 0.12, weight: 2 }));
      layers.push(L.circleMarker([lat, lng], { radius: 5, color, fillColor: color, fillOpacity: 1, weight: 0 }));
      layers.push(mkL(lat, lng));
    } else if (type === 'POLYGON') {
      const raw = area.boundary || area.coordinates || area.points || []; if (!raw.length) return [];
      const ll = raw.map(c => Array.isArray(c) ? [c[1], c[0]] : [c.latitude, c.longitude]);
      layers.push(L.polygon(ll, { color, fillColor: color, fillOpacity: 0.12, weight: 2 }));
      const cLat = ll.reduce((s, p) => s + p[0], 0) / ll.length, cLng = ll.reduce((s, p) => s + p[1], 0) / ll.length;
      layers.push(mkL(cLat, cLng));
    }
    return layers;
  }

  function displayAreas(areas) {
    clearViz(); layersByArea = []; currentAreas = areas;
    const list = document.getElementById('area-list');
    list.innerHTML = '';
    areas.forEach((sa, i) => { const color = COLORS[i % COLORS.length]; layersByArea.push(renderSA(sa, color)); buildAreaRow(sa, i, color); });
  }

  function showOnly(i) {
    clearViz(); const bounds = [];
    (layersByArea[i] || []).forEach(l => {
      l.addTo(map); vizLayers.push(l);
      if (l.getBounds) { const b = l.getBounds(); if (b.isValid()) { bounds.push(b.getNorthEast()); bounds.push(b.getSouthWest()); } }
      else if (l.getLatLng) bounds.push(l.getLatLng());
    });
    if (bounds.length) map.fitBounds(L.latLngBounds(bounds), { padding: [50, 50] });
  }

  function showAll() {
    clearViz(); const bounds = [];
    layersByArea.forEach(layers => layers.forEach(l => {
      l.addTo(map); vizLayers.push(l);
      if (l.getBounds) { const b = l.getBounds(); if (b.isValid()) { bounds.push(b.getNorthEast()); bounds.push(b.getSouthWest()); } }
      else if (l.getLatLng) bounds.push(l.getLatLng());
    }));
    if (bounds.length) map.fitBounds(L.latLngBounds(bounds), { padding: [40, 40] });
  }

  function selectArea(sa) {
    selectedArea = sa;
    document.getElementById('use-area-wrap').hidden = false;
  }

  function buildAreaRow(sa, idx) {
    const el = document.createElement('div'); el.className = 'form-row list-row-clickable';
    el.innerHTML = `<span class="field-name">${sa.name || 'Unnamed'}</span>`
      + (sa.description ? `<div class="field-key">${sa.description}</div>` : '');
    el.addEventListener('click', () => {
      document.querySelectorAll('#area-list .list-row-clickable').forEach(c => c.classList.remove('active'));
      el.classList.add('active'); showOnly(idx); fetchAndShowDetail(sa.id, sa);
      selectArea(sa);
    });
    document.getElementById('area-list').appendChild(el);
  }

  function onLabelClick(sa) {
    currentAreas.forEach((a, i) => {
      const match = a === sa || (a.id && a.id === sa.id);
      const rows = document.querySelectorAll('#area-list .list-row-clickable');
      if (rows[i]) rows[i].classList.toggle('active', match);
      if (match) { showOnly(i); if (rows[i]) rows[i].scrollIntoView({ behavior: 'smooth', block: 'nearest' }); selectArea(a); }
    });
    fetchAndShowDetail(sa.id, sa);
  }

  async function fetchAndShowDetail(areaId, fallback) {
    if (!areaId) { showDetail(fallback); return; }
    const r = await Api.getArea(areaId);
    showDetail(r.ok ? r.data : fallback);
  }

  async function showDetail(sa) {
    const el = document.getElementById('detail-content');
    let html = '';
    if (sa.name) html += drow('Name', sa.name);
    if (sa.description) html += drow('Description', sa.description);
    if (sa.area) html += drow('Geometry', sa.area.areaType || '—');
    if (sa.networkProfiles && sa.networkProfiles.length) {
      html += drow('Network Profiles', sa.networkProfiles.map(p => `<span class="badge badge-neutral" data-profile-id="${p}" style="cursor:pointer;">${p.slice(0, 8)}...</span>`).join(' '));
    }
    if (sa.qosProfiles && sa.qosProfiles.length) {
      html += drow('QoS Profiles', sa.qosProfiles.map(p => `<span class="badge badge-success" data-qos-name="${p}" style="cursor:pointer;">${p}</span>`).join(' '));
    }
    el.innerHTML = html || '<p class="empty-hint">No details available.</p>';
    (sa.networkProfiles || []).forEach(async pid => {
      const name = await resolveProfileName(pid);
      el.querySelectorAll(`[data-profile-id="${pid}"]`).forEach(tag => { tag.textContent = name; });
    });
  }
  document.getElementById('detail-content').addEventListener('click', e => {
    const qt = e.target.closest('[data-qos-name]');
    if (qt) loadQosDetail(qt.dataset.qosName);
  });

  // ── Get / Clear all areas ──
  document.getElementById('get-areas-btn').addEventListener('click', async function () {
    const btn = this; btn.textContent = 'Loading...'; btn.disabled = true; clrSt('areas-status');
    const r = await Api.retrieveAreas({});
    btn.textContent = 'Load All Service Areas'; btn.disabled = false;
    if (!r.ok) { setSt('areas-status', 'HTTP ' + r.status + ': ' + (r.data.message || r.data.error || 'Error'), false); return; }
    const areas = Array.isArray(r.data) ? r.data : [r.data];
    setSt('areas-status', areas.length + ' area(s) — click one to focus', true);
    displayAreas(areas); showAll();
  });

  document.getElementById('clear-map-btn').addEventListener('click', () => {
    clearViz(); layersByArea = []; currentAreas = [];
    document.getElementById('area-list').innerHTML = '<p class="empty-hint">Click &ldquo;Load All Service Areas&rdquo; to load.</p>';
    document.getElementById('detail-content').innerHTML = '<p class="empty-hint">Click an area to see details.</p>';
    clrSt('areas-status');
    selectedArea = null;
    document.getElementById('use-area-wrap').hidden = true;
  });

  // ── Reference: Network Profiles / QoS Profiles browsers ──
  async function loadAllProfiles() {
    const list = document.getElementById('profiles-list'); list.innerHTML = ''; clrSt('profiles-status');
    const r = await Api.listNetworkProfiles();
    if (!r.ok) { setSt('profiles-status', 'Error: ' + (r.data.message || 'Unknown'), false); return; }
    const profiles = Array.isArray(r.data) ? r.data : [r.data];
    setSt('profiles-status', profiles.length + ' profile(s)', true);
    list.innerHTML = profiles.map(p => profileRow(p, false)).join('') || '<p class="empty-hint">None returned.</p>';
  }
  async function loadProfileDetail(pid) {
    const list = document.getElementById('profiles-list'); list.innerHTML = ''; clrSt('profiles-status');
    const r = await Api.getNetworkProfile(pid);
    if (!r.ok) { setSt('profiles-status', 'Error: ' + (r.data.message || 'Unknown'), false); return; }
    setSt('profiles-status', 'Loaded', true);
    list.innerHTML = `<button class="btn btn-ghost btn-sm" id="profiles-back-btn">&larr; All profiles</button>` + profileRow(r.data, true);
    document.getElementById('profiles-back-btn').addEventListener('click', loadAllProfiles);
  }
  function profileRow(p, expanded) {
    let html = `<div class="form-row"><span class="field-name">${p.name || p.id || 'Profile'}</span>`;
    if (!expanded) {
      if (p.id) html += `<div class="field-key">${p.id}</div>`;
      html += ` <span class="badge badge-neutral" data-profile-id="${p.id || p.name || ''}" style="cursor:pointer;">View details</span>`;
    } else {
      html += drow('Maximum allowed number of devices', p.maxNumberOfDevices != null ? p.maxNumberOfDevices : '—');
      if (p.aggregatedUlThroughput) html += drow('Aggregated Uplink Throughput', fmtTp(p.aggregatedUlThroughput));
      if (p.aggregatedDlThroughput) html += drow('Aggregated Downlink Throughput', fmtTp(p.aggregatedDlThroughput));
      if (p.qosProfiles && p.qosProfiles.length) html += drow('Available QoS Profiles', p.qosProfiles.map(q => `<span class="badge badge-success" data-qos-name="${q}" style="cursor:pointer;">${q}</span>`).join(' '));
      if (p.defaultQosProfile) html += drow('Default QoS Profile', `<span class="badge badge-success">${p.defaultQosProfile}</span>`);
    }
    return html + '</div>';
  }
  document.getElementById('load-profiles-btn').addEventListener('click', loadAllProfiles);
  document.getElementById('profiles-list').addEventListener('click', e => {
    const pt = e.target.closest('[data-profile-id]'), qt = e.target.closest('[data-qos-name]');
    if (pt) loadProfileDetail(pt.dataset.profileId);
    if (qt) loadQosDetail(qt.dataset.qosName);
  });

  async function loadAllQos() {
    const list = document.getElementById('qos-list'); list.innerHTML = ''; clrSt('qos-status');
    const r = await Api.listQosProfiles();
    if (!r.ok) { setSt('qos-status', r.data.error || 'Error', false); return; }
    const profiles = Array.isArray(r.data) ? r.data : (r.data.qosProfiles || [r.data]);
    setSt('qos-status', profiles.length + ' profile(s)', true);
    list.innerHTML = profiles.map(p => { const name = typeof p === 'string' ? p : (p.name || p.qosProfile || JSON.stringify(p)); return `<div class="form-row"><span class="badge badge-success" data-qos-name="${name}" style="cursor:pointer;">${name}</span></div>`; }).join('') || '<p class="empty-hint">None returned.</p>';
  }
  async function loadQosDetail(name) {
    const list = document.getElementById('qos-list'); list.innerHTML = ''; clrSt('qos-status');
    const r = await Api.getQosProfile(name);
    if (!r.ok) { setSt('qos-status', r.data.error || 'Error', false); return; }
    setSt('qos-status', 'Loaded', true);
    const p = r.data;
    const skip = { name: 1, qosProfile: 1 };
    let html = `<button class="btn btn-ghost btn-sm" id="qos-back-btn">&larr; All QoS profiles</button><div class="form-row"><span class="field-name">${p.name || name}</span>`;
    Object.keys(p).forEach(k => { if (skip[k]) return; html += drow(k, typeof p[k] === 'object' ? JSON.stringify(p[k]) : String(p[k])); });
    html += '</div>';
    list.innerHTML = html;
    document.getElementById('qos-back-btn').addEventListener('click', loadAllQos);
  }
  document.getElementById('load-qos-btn').addEventListener('click', loadAllQos);
  document.getElementById('qos-list').addEventListener('click', e => { const qt = e.target.closest('[data-qos-name]'); if (qt) loadQosDetail(qt.dataset.qosName); });

  // ── Draw tools: point / circle / polygon ──
  let drawMode = null, drawing = false, drawPoints = [], drawMarkers = [], drawPolyline = null, drawPolygon = null, drawCircle = null;
  const MAX_PTS = 15;

  function setMode(mode) {
    resetDraw(); drawMode = mode; drawing = true;
    document.getElementById('mode-point-btn').classList.toggle('active', mode === 'point');
    document.getElementById('mode-circle-btn').classList.toggle('active', mode === 'circle');
    document.getElementById('mode-polygon-btn').classList.toggle('active', mode === 'polygon');
    document.getElementById('map').classList.add('draw-mode');
    document.getElementById('draw-hint').textContent =
      mode === 'point' ? 'Click on the map to place a point.'
      : mode === 'circle' ? 'Click on the map to place the circle center, then set the radius.'
      : 'Click to add points (3–15). Close when done.';
  }

  function resetDraw() {
    drawMarkers.forEach(m => map.removeLayer(m)); drawMarkers = []; drawPoints = [];
    if (drawPolyline) { map.removeLayer(drawPolyline); drawPolyline = null; }
    if (drawPolygon) { map.removeLayer(drawPolygon); drawPolygon = null; }
    if (drawCircle) { map.removeLayer(drawCircle); drawCircle = null; }
    ['undo-btn', 'close-polygon-btn', 'point-count', 'draw-validation', 'coords-wrap', 'circle-radius-wrap', 'search-wrap', 'search-at-btn', 'search-overlapping-btn', 'search-covering-btn']
      .forEach(id => { document.getElementById(id).hidden = true; });
    if (!drawMode) { document.getElementById('map').classList.remove('draw-mode'); document.getElementById('draw-hint').textContent = 'Choose a mode then click the map.'; }
  }

  function redrawPoly() {
    if (drawPolyline) { map.removeLayer(drawPolyline); drawPolyline = null; }
    if (drawPoints.length < 2) return;
    drawPolyline = L.polyline(drawPoints.map(p => [p.lat, p.lng]), { color: '#b9770e', weight: 2, dashArray: '5,5' }).addTo(map);
  }

  function redrawCircle() {
    if (drawCircle) { map.removeLayer(drawCircle); drawCircle = null; }
    if (!drawPoints.length) return;
    const radius = Math.max(1, Math.min(200000, +document.getElementById('circle-radius').value || 1000));
    drawCircle = L.circle([drawPoints[0].lat, drawPoints[0].lng], { radius, color: '#b9770e', fillColor: '#b9770e', fillOpacity: 0.12, weight: 2 }).addTo(map);
  }

  function addDM(pt) {
    const m = L.circleMarker([pt.lat, pt.lng], { radius: 6, color: '#b9770e', fillColor: '#f0ad4e', fillOpacity: 1, weight: 2 }).addTo(map);
    if (drawMode !== 'circle') m.bindTooltip(String(drawPoints.indexOf(pt) + 1), { permanent: true, direction: 'top', offset: [0, -8] });
    m.on('mousedown', e => {
      map.dragging.disable(); const i = drawMarkers.indexOf(m);
      map.on('mousemove', function drag(ev) {
        drawPoints[i] = { lat: ev.latlng.lat, lng: ev.latlng.lng }; m.setLatLng(ev.latlng);
        redrawPoly(); redrawCircle(); updateCoords(); updateSearchUI();
      });
      map.once('mouseup', () => map.dragging.enable() || map.off('mousemove'));
      L.DomEvent.stopPropagation(e);
    });
    return m;
  }

  function updateCoords() {
    const wrap = document.getElementById('coords-wrap');
    if (!drawPoints.length || drawMode !== 'polygon') { wrap.hidden = true; return; }
    wrap.hidden = false;
    document.getElementById('coords-table').textContent = drawPoints.map((p, i) => `${i + 1}: ${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}`).join('\n');
  }

  function updateValidation() {
    const el = document.getElementById('draw-validation');
    if (!drawPoints.length || drawMode !== 'polygon') { el.hidden = true; return; }
    el.hidden = false;
    el.classList.remove('status-success', 'status-error');
    if (drawPoints.length < 3) { el.classList.add('status-error'); el.textContent = 'Need at least 3 points.'; }
    else { el.classList.add('status-success'); el.textContent = drawPoints.length + ' points — ready to close.'; }
  }

  function getExtraFilters() {
    const ex = {};
    const n = document.getElementById('filter-name').value.trim();
    const p = document.getElementById('filter-profile-id').value.trim();
    const q = document.getElementById('filter-qos-name').value.trim();
    if (n) ex.byName = n; if (p) ex.byNetworkProfileId = p; if (q) ex.byQosProfileName = q;
    return ex;
  }

  function updateSearchUI() {
    const searchWrap = document.getElementById('search-wrap');
    const atBtn = document.getElementById('search-at-btn'), overlapBtn = document.getElementById('search-overlapping-btn'), coverBtn = document.getElementById('search-covering-btn');
    if (drawMode === 'point' && drawPoints.length === 1) {
      searchWrap.hidden = false; atBtn.hidden = false; overlapBtn.hidden = true; coverBtn.hidden = true;
    } else if ((drawMode === 'circle' && drawPoints.length === 1) || (drawMode === 'polygon' && drawPoints.length >= 3)) {
      searchWrap.hidden = false; atBtn.hidden = true; overlapBtn.hidden = false; coverBtn.hidden = false;
    } else {
      searchWrap.hidden = true;
    }
  }

  function currentAreaShape() {
    if (drawMode === 'circle' && drawPoints.length === 1) {
      const radius = Math.max(1, Math.min(200000, +document.getElementById('circle-radius').value || 1000));
      return { areaType: 'CIRCLE', center: { latitude: +drawPoints[0].lat.toFixed(6), longitude: +drawPoints[0].lng.toFixed(6) }, radius };
    }
    if (drawMode === 'polygon' && drawPoints.length >= 3) {
      return { areaType: 'POLYGON', boundary: drawPoints.map(p => ({ latitude: +p.lat.toFixed(6), longitude: +p.lng.toFixed(6) })) };
    }
    return null;
  }

  async function doSearch(geoBody, btn, label) {
    const body = Object.assign({}, geoBody, getExtraFilters());
    btn.textContent = 'Searching...'; btn.disabled = true; clrSt('areas-status');
    const r = await Api.retrieveAreas(body);
    btn.textContent = label; btn.disabled = false;
    if (!r.ok) { setSt('areas-status', 'HTTP ' + r.status + ': ' + (r.data.message || r.data.error || 'Error'), false); return; }
    const areas = Array.isArray(r.data) ? r.data : [r.data];
    setSt('areas-status', areas.length + ' area(s) found', true);
    displayAreas(areas); showAll();
  }

  map.on('click', e => {
    if (!drawing || !drawMode) return;
    if (drawMode === 'point' || drawMode === 'circle') {
      drawMarkers.forEach(m => map.removeLayer(m)); drawMarkers = [];
      drawPoints = [{ lat: e.latlng.lat, lng: e.latlng.lng }];
      drawMarkers.push(addDM(drawPoints[0]));
      if (drawMode === 'circle') { document.getElementById('circle-radius-wrap').hidden = false; redrawCircle(); document.getElementById('draw-hint').textContent = 'Center placed. Set radius, drag to adjust position.'; }
      else document.getElementById('draw-hint').textContent = 'Point placed. Drag to adjust.';
      updateSearchUI(); return;
    }
    if (drawPoints.length >= MAX_PTS) return;
    const pt = { lat: e.latlng.lat, lng: e.latlng.lng };
    drawPoints.push(pt); drawMarkers.push(addDM(pt));
    redrawPoly(); updateCoords(); updateValidation(); updateSearchUI();
    document.getElementById('undo-btn').hidden = false;
    document.getElementById('close-polygon-btn').hidden = drawPoints.length < 3;
    document.getElementById('point-count').hidden = false;
    document.getElementById('point-count').textContent = drawPoints.length + ' / ' + MAX_PTS + ' points';
  });

  document.getElementById('mode-point-btn').addEventListener('click', () => setMode('point'));
  document.getElementById('mode-circle-btn').addEventListener('click', () => setMode('circle'));
  document.getElementById('mode-polygon-btn').addEventListener('click', () => setMode('polygon'));
  document.getElementById('circle-radius').addEventListener('input', redrawCircle);

  document.getElementById('undo-btn').addEventListener('click', () => {
    if (!drawPoints.length) return;
    map.removeLayer(drawMarkers.pop()); drawPoints.pop();
    redrawPoly(); updateCoords(); updateValidation(); updateSearchUI();
    document.getElementById('undo-btn').hidden = !drawPoints.length;
    document.getElementById('close-polygon-btn').hidden = drawPoints.length < 3;
    if (drawPoints.length) document.getElementById('point-count').textContent = drawPoints.length + ' / ' + MAX_PTS + ' points';
    else document.getElementById('point-count').hidden = true;
  });

  document.getElementById('close-polygon-btn').addEventListener('click', () => {
    if (drawPoints.length < 3) return;
    if (drawPolyline) { map.removeLayer(drawPolyline); drawPolyline = null; }
    drawPolygon = L.polygon(drawPoints.map(p => [p.lat, p.lng]), { color: '#b9770e', fillColor: '#b9770e', fillOpacity: 0.15, weight: 2 }).addTo(map);
    drawing = false; document.getElementById('map').classList.remove('draw-mode');
    document.getElementById('close-polygon-btn').hidden = true;
    document.getElementById('draw-validation').hidden = true;
    document.getElementById('draw-hint').textContent = 'Polygon complete. Drag points to adjust.';
    updateSearchUI();
  });

  document.getElementById('clear-draw-btn').addEventListener('click', () => {
    resetDraw();
    if (drawMode) { drawing = true; document.getElementById('map').classList.add('draw-mode'); document.getElementById('draw-hint').textContent = drawMode === 'point' ? 'Click on the map to place a point.' : drawMode === 'circle' ? 'Click on the map to place the circle center, then set the radius.' : 'Click to add points (3–15). Close when done.'; }
  });

  document.getElementById('search-at-btn').addEventListener('click', function () {
    if (!drawPoints.length) return;
    doSearch({ atLocation: { latitude: +drawPoints[0].lat.toFixed(6), longitude: +drawPoints[0].lng.toFixed(6) } }, this, 'Find Areas At Point');
  });
  document.getElementById('search-overlapping-btn').addEventListener('click', function () {
    const shape = currentAreaShape(); if (!shape) return;
    doSearch({ overlappingArea: shape }, this, 'Find Overlapping');
  });
  document.getElementById('search-covering-btn').addEventListener('click', function () {
    const shape = currentAreaShape(); if (!shape) return;
    doSearch({ coveringArea: shape }, this, 'Find Covering');
  });
  document.getElementById('search-filters-only-btn').addEventListener('click', function () {
    const filters = getExtraFilters();
    if (!Object.keys(filters).length) { window.showToast('Enter at least one filter, or draw a shape on the map first.', 'error'); return; }
    doSearch({}, this, 'Search by Filters Only');
  });

  // ── "Use This Area" -> hand off to the Network stage. Only prompts to
  // abandon a downstream Network/Access if the user is actually picking a
  // *different* area than the one already active in the wizard. ──
  document.getElementById('use-area-btn').addEventListener('click', () => {
    if (!selectedArea) return;
    const isDifferent = !wizard.area || wizard.area.id !== selectedArea.id;
    if (isDifferent && !wizard.confirmAndResetFrom('areas')) return;
    wizard.setArea(selectedArea);
    nav.goTo('network');
  });

  return {
    activate() { setTimeout(() => map.invalidateSize(), 50); if (!vizLayers.length && layersByArea.length) showAll(); },
    deactivate() {}
  };
}
