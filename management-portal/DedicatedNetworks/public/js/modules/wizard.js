/*
License: 5G-MAG Public License (v1.0)
Author: Jordi Joan Gimenez
Copyright: (C) 2026 5G-MAG Association

For full license terms please see the LICENSE file distributed with this
program. If this file is missing then the license can be retrieved from
https://hub.5g-mag.com/Getting-Started/OFFICIAL_5G-MAG_Public_License_v1.0.pdf

Shared state for the Guided Setup wizard (Areas -> Network -> Access ->
Devices) AND for Quick Booking — both modes read/write the same
area/network/access so switching between them never loses context.
*/

import { Api } from './api.js';

const STORAGE_KEY = 'dn_wizard_state_v1';

const state = { area: null, network: null, access: null };
const listeners = new Set();

function persist() {
  // Only ids are persisted — full objects are re-fetched on load so we
  // never show stale data after a reload.
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      areaId: state.area && state.area.id,
      networkId: state.network && state.network.id,
      accessId: state.access && state.access.id
    }));
  } catch (_) {}
}

function emit() { listeners.forEach(fn => fn(state)); }

export const wizard = {
  get area() { return state.area; },
  get network() { return state.network; },
  get access() { return state.access; },

  setArea(area) {
    state.area = area;
    state.network = null;
    state.access = null;
    persist(); emit();
  },
  setNetwork(network) {
    state.network = network;
    state.access = null;
    persist(); emit();
  },
  setAccess(access) {
    state.access = access;
    persist(); emit();
  },

  /** Which of the 4 stages are currently reachable, in order. */
  unlockedStages() {
    const u = ['areas'];
    if (state.area) u.push('network');
    if (state.network) u.push('access');
    if (state.access) u.push('devices');
    return u;
  },
  isUnlocked(stage) { return this.unlockedStages().includes(stage); },
  /** Why a stage is still locked, for the "one-line reason" the UX
   * principles require next to a disabled step. */
  lockedReason(stage) {
    if (stage === 'network') return 'Select an area first';
    if (stage === 'access') return 'Create a network first';
    return null;
  },

  /**
   * Called before changing the selection at an earlier stage while later
   * stages already hold state — confirms (native confirm(), same as every
   * destructive action in this app's reference tools) the downstream
   * Network/Access get abandoned (not deleted from the API, just forgotten
   * by the wizard) before resetting.
   */
  confirmAndResetFrom(stage) {
    const hasDownstream =
      (stage === 'areas' && (state.network || state.access)) ||
      (stage === 'network' && state.access);
    if (!hasDownstream) return true;
    const what = stage === 'areas' ? 'the current Network and Access' : 'the current Access';
    const ok = confirm(`Picking a different ${stage === 'areas' ? 'area' : 'network'} will abandon ${what} in this wizard (they are not deleted from the API — delete them first if you want them gone). Continue?`);
    if (!ok) return false;
    if (stage === 'areas') { state.network = null; state.access = null; }
    if (stage === 'network') { state.access = null; }
    persist(); emit();
    return true;
  },

  onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },

  /** Re-fetch full Area/Network/Access objects for the ids persisted from
   * a previous session. Call once at boot. */
  async hydrate() {
    let saved;
    try { saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); } catch (_) { saved = {}; }
    if (saved.areaId) {
      const r = await Api.getArea(saved.areaId);
      if (r.ok) state.area = r.data;
    }
    if (state.area && saved.networkId) {
      const r = await Api.getNetwork(saved.networkId);
      if (r.ok) state.network = r.data;
    }
    if (state.network && saved.accessId) {
      const r = await Api.getAccess(saved.accessId);
      if (r.ok) state.access = r.data;
    }
    persist();
    emit();
  }
};
