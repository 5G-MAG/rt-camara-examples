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
async function req(path, { method = 'GET', body, headers } = {}) {
  try {
    const res = await fetch(path, {
      method,
      headers: body !== undefined || headers ? { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(headers || {}) } : undefined,
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

  // Accesses. One access holds a list of devices (create takes `devices`; the answer carries `stats` and
  // `recentAccessDevices`). The server also answers in the earlier shape, one `device` and a `status` on the
  // access, which the sandbox still uses: it takes one device per access and has no /devices endpoints
  // (they answer 404 "No matching api service"). The server gives every answer a top-level `status` for the screens.
  listAccesses: networkId => req(`/api/accesses?networkId=${encodeURIComponent(networkId)}`),
  // No filter: every access of this API consumer, across networks.
  listAllAccesses: () => req('/api/accesses'),
  createAccess: body => req('/api/accesses', { method: 'POST', body }),
  getAccess: id => req(`/api/accesses/${id}`),
  deleteAccess: id => req(`/api/accesses/${id}`, { method: 'DELETE' }),
  // Devices of an access: page, perPage and deviceStatus may be given as `query`; `device` narrows the list to
  // one device (sent as the x-device header, e.g. 'phonenumber="+41795550001"')
  listAccessDevices: (id, query, device) => req(`/api/accesses/${id}/devices${query ? '?' + new URLSearchParams(query) : ''}`, device ? { headers: { 'x-device': device } } : undefined),
  addDevices: (id, devices) => req(`/api/accesses/${id}/devices/add`, { method: 'POST', body: { devices } }),
  removeDevices: (id, devices) => req(`/api/accesses/${id}/devices/remove`, { method: 'POST', body: { devices } }),

  sandboxHealth: () => req('/api/sandbox-health'),
  notifications: () => req('/api/webhooks/notifications'),

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
