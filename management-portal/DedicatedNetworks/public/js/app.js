/*
License: 5G-MAG Public License (v1.0)
Author: Jordi Joan Gimenez
Copyright: (C) 2026 5G-MAG Association

For full license terms please see the LICENSE file distributed with this
program. If this file is missing then the license can be retrieved from
https://hub.5g-mag.com/Getting-Started/OFFICIAL_5G-MAG_Public_License_v1.0.pdf

Entry point. Tab switching, dark-mode toggle, per-tab connectivity dots and
the toast helper are copied from rt-mbs-application-provider/rt-media-server
verbatim (same markup, same behaviour) rather than reinvented.
*/

import { Api } from './modules/api.js';
import { wizard } from './modules/wizard.js';
import { drow, fmtTp } from './modules/uiCommon.js';
import { initStageAreas } from './modules/stageAreas.js';
import { initStageNetwork } from './modules/stageNetwork.js';
import { initStageAccess } from './modules/stageAccess.js';
import { initStageDevices } from './modules/stageDevices.js';
import { initQuickBooking } from './modules/quickBooking.js';
import { initStageConfig } from './modules/stageConfig.js';

window.addEventListener('load', () => {

  // ── Dark mode toggle (exact copy of the reference apps' pattern) ──
  (function () {
    const btn = document.getElementById('theme-toggle');
    const STORAGE_KEY = 'dn-portal-theme';
    function applyTheme(theme) {
      if (theme === 'dark') document.documentElement.setAttribute('data-theme', 'dark');
      else document.documentElement.removeAttribute('data-theme');
      btn.textContent = theme === 'dark' ? '☀ Light mode' : '☾ Dark mode';
      btn.setAttribute('aria-pressed', theme === 'dark' ? 'true' : 'false');
    }
    applyTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light');
    btn.addEventListener('click', () => {
      const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      try { localStorage.setItem(STORAGE_KEY, next); } catch (_) {}
      applyTheme(next);
    });
  }());

  // ── Toast helper, shared globally exactly like the reference apps ──
  window.showToast = function (message, kind) {
    const el = document.getElementById('toast');
    el.textContent = message;
    el.className = kind || '';
    el.hidden = false;
    clearTimeout(window._toastTimer);
    window._toastTimer = setTimeout(() => { el.hidden = true; }, 4000);
  };

  // ── Tabs: Areas / Network / Access / Devices / Quick Booking ──
  let currentTab = 'areas';
  // `nav.goTo` is filled in below, after all stage controllers exist — each
  // stage module only needs to *call* it later (e.g. "Continue to Access"),
  // never at its own init time.
  const nav = { goTo: tab => goTo(tab) };
  const controllers = {
    areas: initStageAreas(nav),
    network: initStageNetwork(nav),
    access: initStageAccess(nav),
    devices: initStageDevices(nav),
    quick: initQuickBooking(nav),
    config: initStageConfig()
  };
  // Devices is always reachable — the local device pool (identities) can be
  // built at any time, independently of where a user is in the guided flow;
  // only *attaching* a pool device to a network still requires one to exist,
  // which stageDevices.js itself checks and explains inline.
  const ALWAYS_UNLOCKED = ['areas', 'quick', 'config', 'devices'];

  function goTo(tab) {
    if (!ALWAYS_UNLOCKED.includes(tab) && !wizard.isUnlocked(tab)) return;
    if (controllers[currentTab]) controllers[currentTab].deactivate();
    document.querySelectorAll('.tab-btn').forEach(t => { t.classList.remove('active'); t.setAttribute('aria-selected', 'false'); });
    document.querySelectorAll('main[role="tabpanel"]').forEach(m => { m.hidden = true; });
    document.getElementById('tabbtn-' + tab).classList.add('active');
    document.getElementById('tabbtn-' + tab).setAttribute('aria-selected', 'true');
    document.getElementById('tab-' + tab).hidden = false;
    currentTab = tab;
    controllers[tab].activate();
  }
  document.querySelectorAll('.tab-btn').forEach(t => t.addEventListener('click', () => goTo(t.dataset.tab)));

  function updateTabLocks() {
    const unlocked = wizard.unlockedStages();
    ['network', 'access'].forEach(stage => {
      const btn = document.getElementById('tabbtn-' + stage);
      const isUnlocked = unlocked.includes(stage);
      btn.disabled = !isUnlocked;
      btn.title = isUnlocked ? '' : (wizard.lockedReason(stage) || '');
    });
  }
  wizard.onChange(updateTabLocks);
  updateTabLocks();

  // ── Network profile detail dialog (native <dialog>) ──
  async function openProfileDialog(profileId) {
    const dlg = document.getElementById('profile-dialog');
    document.getElementById('profile-dialog-title').textContent = 'Network Profile';
    document.getElementById('profile-dialog-body').innerHTML = '<p class="empty-hint">Loading...</p>';
    dlg.showModal();
    const r = await Api.getNetworkProfile(profileId);
    if (!r.ok) { document.getElementById('profile-dialog-body').innerHTML = '<p class="empty-hint">Could not load profile.</p>'; return; }
    const p = r.data;
    document.getElementById('profile-dialog-title').textContent = p.name || profileId;
    let html = drow('Profile Name', p.name || '—');
    if (p.id) html += drow('ID', `<span class="field-key">${p.id}</span>`);
    if (p.maxNumberOfDevices != null) html += drow('Maximum allowed number of devices', p.maxNumberOfDevices);
    if (p.aggregatedUlThroughput) html += drow('Aggregated Uplink Throughput', fmtTp(p.aggregatedUlThroughput));
    if (p.aggregatedDlThroughput) html += drow('Aggregated Downlink Throughput', fmtTp(p.aggregatedDlThroughput));
    if (p.qosProfiles && p.qosProfiles.length) html += `<p class="form-label" style="margin-top:0.8rem;">Available QoS Profiles</p>${p.qosProfiles.map(q => `<span class="badge badge-neutral">${q}</span> `).join('')}`;
    if (p.defaultQosProfile) html += `<p class="form-label" style="margin-top:0.8rem;">Default QoS Profile</p><span class="badge badge-success">${p.defaultQosProfile}</span>`;
    document.getElementById('profile-dialog-body').innerHTML = html;
  }
  document.addEventListener('click', e => {
    const tag = e.target.closest('[data-profile-id]');
    if (tag && tag.dataset.profileId) openProfileDialog(tag.dataset.profileId);
  });
  document.getElementById('profile-dialog-close').addEventListener('click', () => document.getElementById('profile-dialog').close());

  // ── Per-tab connectivity dots: poll /api/sandbox-health (same pattern as
  // rt-mbs-application-provider's /api/health poll) ──
  (function pollSandboxHealth() {
    function paint(key, ok) {
      const dot = document.querySelector(`.tab-dot[data-status-for="${key}"]`);
      if (!dot) return;
      dot.classList.remove('up', 'down');
      dot.classList.add(ok ? 'up' : 'down');
      dot.title = key + ': ' + (ok ? 'Connected' : 'Not reachable');
    }
    Api.sandboxHealth().then(r => {
      if (!r.ok) return;
      Object.keys(r.data).forEach(k => paint(k, r.data[k] && r.data[k].ok));
    }).catch(() => {}).finally(() => setTimeout(pollSandboxHealth, 60000));
  }());

  // ── Boot: restore any previous Area/Network/Access, land on the furthest
  // unlocked tab so a reload doesn't lose place. ──
  wizard.hydrate().then(() => {
    updateTabLocks();
    const unlocked = wizard.unlockedStages();
    goTo(unlocked[unlocked.length - 1]);
  });
});
