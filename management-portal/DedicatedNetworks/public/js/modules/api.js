/*
License: 5G-MAG Public License (v1.0)
Author: Jordi Joan Gimenez
Copyright: (C) 2026 5G-MAG Association

For full license terms please see the LICENSE file distributed with this
program. If this file is missing then the license can be retrieved from
https://hub.5g-mag.com/Getting-Started/OFFICIAL_5G-MAG_Public_License_v1.0.pdf

Thin fetch wrappers to /api/* plus small caches shared by every stage, so
each module doesn't repeat its own fetch/JSON/error-shape boilerplate.
*/

/** GET/POST/DELETE to our own backend, always resolving (never throwing on
 * a non-2xx HTTP status) with { ok, status, data }. */
async function req(path, { method = 'GET', body } = {}) {
  try {
    const res = await fetch(path, {
      method,
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined
    });
    const status = res.status;
    if (status === 204) return { ok: res.ok, status, data: {} };
    const text = await res.text();
    let data;
    try { data = text ? JSON.parse(text) : {}; } catch (_) { data = { error: text }; }
    return { ok: res.ok, status, data };
  } catch (err) {
    return { ok: false, status: 0, data: { error: err.message } };
  }
}

export const Api = {
  // Areas
  retrieveAreas: body => req('/api/areas/retrieve', { method: 'POST', body }),
  getArea: id => req(`/api/areas/${id}`),

  // Profiles
  listNetworkProfiles: () => req('/api/profiles/network'),
  getNetworkProfile: id => req(`/api/profiles/network/${id}`),
  listQosProfiles: () => req('/api/profiles/qos'),
  getQosProfile: name => req(`/api/profiles/qos/${encodeURIComponent(name)}`),

  // Networks
  listNetworks: name => req(`/api/networks${name ? '?name=' + encodeURIComponent(name) : ''}`),
  createNetwork: body => req('/api/networks', { method: 'POST', body }),
  getNetwork: id => req(`/api/networks/${id}`),
  deleteNetwork: id => req(`/api/networks/${id}`, { method: 'DELETE' }),

  // Accesses — this sandbox implements the one-device-per-access shape
  // ({networkId, device, id, status, statusInfo}), NOT the newer bulk
  // `devices[]`/stats/recentAccessDevices model from the current
  // camaraproject/DedicatedNetworks spec: GET .../devices and
  // .../devices/add|remove both 404 here ("No matching api service"),
  // confirmed empirically against the live sandbox. To give a device
  // access to a network, create a separate Access per device instead.
  listAccesses: networkId => req(`/api/accesses?networkId=${encodeURIComponent(networkId)}`),
  createAccess: body => req('/api/accesses', { method: 'POST', body }),
  getAccess: id => req(`/api/accesses/${id}`),
  deleteAccess: id => req(`/api/accesses/${id}`, { method: 'DELETE' }),

  sandboxHealth: () => req('/api/sandbox-health'),

  // Config
  getConfig: () => req('/api/config'),
  saveConfig: body => req('/api/config', { method: 'POST', body })
};

// ── Small caches shared across stages (profile/area id -> display name) ──
export const nameCache = {
  profile: {},
  area: {}
};

export async function resolveProfileName(id) {
  if (!id) return id;
  if (nameCache.profile[id]) return nameCache.profile[id];
  const r = await Api.getNetworkProfile(id);
  const name = r.ok ? (r.data.name || id) : id;
  nameCache.profile[id] = name;
  return name;
}

export async function resolveAreaName(id) {
  if (!id) return id;
  if (nameCache.area[id]) return nameCache.area[id];
  const r = await Api.getArea(id);
  const name = r.ok ? (r.data.name || id) : id;
  nameCache.area[id] = name;
  return name;
}
