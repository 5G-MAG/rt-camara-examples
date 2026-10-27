/*
License: 5G-MAG Public License (v1.0)
Author: Jordi Joan Gimenez
Copyright: (C) 2026 5G-MAG Association

For full license terms please see the LICENSE file distributed with this
program. If this file is missing then the license can be retrieved from
https://hub.5g-mag.com/Getting-Started/OFFICIAL_5G-MAG_Public_License_v1.0.pdf
*/

// Accesses as the CAMARA Dedicated Network Accesses API defines them (release r2.2, version 0.2.0-rc.1): one
// access holds a list of devices. Create takes `devices`; the answer is 201 (every device accepted, listed in
// `recentAccessDevices`) or 207 (some accepted, the failed ones in `results`), and an access carries `stats`,
// not a status; each device has its own status.
//
// The portal's screens show one status per access, so the answer is given a top-level `status`, `statusInfo`
// and `device` taken from the first device. A deployment that still answers in the earlier form (one `device`
// per access, a status on the access) is served too, and its answer is left as it is.

const { apiRequest } = require('./apiService');

const BASE = () => process.env.ACCESSES_URL;

/** The request body the specification defines: `devices` list, not a single `device`. */
function toSpecBody(body) {
  const spec = { ...body };
  if (spec.device && !spec.devices) spec.devices = [spec.device];
  delete spec.device;
  return spec;
}

/** True if the API refused the body because it wants the earlier single `device` form. */
function wantsSingleDevice(r) {
  if (r.status !== 400 && r.status !== 422) return false;
  const message = typeof r.data === 'string' ? r.data : JSON.stringify(r.data);
  return /['"`]device['"`]/i.test(message) && /(missing|required)/i.test(message);
}

/** Top-level status for the screens: the access's own if it has one, else derived from its first device. */
function withDeviceStatus(access, firstDevice) {
  if (!access || typeof access !== 'object' || access.status) return access;
  const first = firstDevice || (Array.isArray(access.recentAccessDevices) ? access.recentAccessDevices[0] : null);
  const out = { ...access };
  if (first) {
    out.status = first.status;
    if (first.statusInfo) out.statusInfo = first.statusInfo;
    if (first.device && !out.device) out.device = first.device;
  } else if (access.stats) {
    const { totalGranted = 0, totalDenied = 0, totalDevices = 0 } = access.stats;
    if (totalGranted > 0) out.status = 'GRANTED';
    else if (totalDenied > 0 && totalDenied === totalDevices) out.status = 'DENIED';
    else if (totalDevices > 0) out.status = 'REQUESTED';
  }
  return out;
}

/** Creates an access. Returns { status, ok, data, singleDeviceForm }. */
async function createAccess(body) {
  const url = `${BASE()}/accesses`;
  const spec = toSpecBody(body);
  let r = await apiRequest(url, { method: 'POST', body: spec });
  let singleDeviceForm = false;
  if (wantsSingleDevice(r) && Array.isArray(spec.devices)) {
    if (spec.devices.length !== 1) {
      return {
        status: 422, ok: false, singleDeviceForm: true,
        data: {
          status: 422, code: 'UNPROCESSABLE_CONTENT',
          message: 'This API deployment takes one device per access. Create one access for each device.'
        }
      };
    }
    const earlier = { ...spec, device: spec.devices[0] };
    delete earlier.devices;
    r = await apiRequest(url, { method: 'POST', body: earlier });
    singleDeviceForm = true;
  }
  if (r.ok) r.data = withDeviceStatus(r.data);
  r.singleDeviceForm = singleDeviceForm;
  return r;
}

/** Reads an access. If it has no status of its own, asks for its first device to give it one. */
async function readAccess(accessId) {
  const r = await apiRequest(`${BASE()}/accesses/${accessId}`, { method: 'GET' });
  if (!r.ok || !r.data || r.data.status) return r;
  const devices = await apiRequest(`${BASE()}/accesses/${accessId}/devices?perPage=1`, { method: 'GET' });
  const first = devices.ok && devices.data && Array.isArray(devices.data.items) ? devices.data.items[0] : null;
  r.data = withDeviceStatus(r.data, first);
  return r;
}

/** Lists accesses with the same normalisation. A listed access with no status keeps the counts of its stats. */
function normaliseList(accesses) {
  return accesses.map(a => withDeviceStatus(a));
}

module.exports = { createAccess, readAccess, normaliseList, toSpecBody, wantsSingleDevice, withDeviceStatus };
