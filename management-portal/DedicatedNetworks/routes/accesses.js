/*
License: 5G-MAG Public License (v1.0)
Author: Jordi Joan Gimenez
Copyright: (C) 2026 5G-MAG Association

For full license terms please see the LICENSE file distributed with this
program. If this file is missing then the license can be retrieved from
https://hub.5g-mag.com/Getting-Started/OFFICIAL_5G-MAG_Public_License_v1.0.pdf
*/

const express = require('express');
const { apiRequest, listPages } = require('../services/apiService');
const { sinkFields } = require('../services/webhookService');
const { createAccess, readAccess, normaliseList } = require('../services/accessService');
const router = express.Router();

const BASE = () => process.env.ACCESSES_URL;

// Query parameters each list accepts, as the Dedicated Network Accesses API defines them. A list can also be
// narrowed to one device with the x-device header (the device as `phonenumber="+123456789"`), passed on as sent.
const ACCESS_FILTERS = ['networkId'];
const DEVICE_FILTERS = ['deviceStatus'];

function deviceHeader(req) {
  return req.get('x-device') ? { 'x-device': req.get('x-device') } : {};
}

function withFilters(url, query, names) {
  names.forEach(n => { if (query[n]) url.searchParams.set(n, query[n]); });
  return url;
}

// With ?page= the caller asks for one page and gets the API's page back as it is; without it, every item,
// from all pages, as one array (?perPage= then sets the size of the pages read).
async function listOrPage(req, res, url, filters, normalise = items => items) {
  withFilters(url, req.query, filters);
  if (req.query.page) {
    ['page', 'perPage'].forEach(n => { if (req.query[n]) url.searchParams.set(n, req.query[n]); });
    const r = await apiRequest(url.toString(), { method: 'GET', headers: deviceHeader(req) });
    return res.status(r.status).json(r.data);
  }
  const r = await listPages(url.toString(), { perPage: Number(req.query.perPage) || undefined, headers: deviceHeader(req) });
  return res.status(r.status).json(r.ok ? normalise(r.data) : r.data);
}

// GET /api/accesses
router.get('/', async (req, res) => {
  try {
    await listOrPage(req, res, new URL(`${BASE()}/accesses`), ACCESS_FILTERS, normaliseList);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// POST /api/accesses
// The body may hold `devices` (a list) or, as the screens send it, one `device`. Answers carry `recentAccessDevices`.
router.post('/', async (req, res) => {
  try {
    const body = { ...req.body };
    Object.assign(body, sinkFields('accesses', req.body));
    console.log('[CREATE ACCESS] body sent to API:', JSON.stringify(body, null, 2));
    const result = await createAccess(body);
    console.log('[CREATE ACCESS] API response status:', result.status, JSON.stringify(result.data));
    res.status(result.status).json(result.data);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// GET /api/accesses/:accessId
router.get('/:accessId', async (req, res) => {
  try {
    const result = await readAccess(req.params.accessId);
    res.status(result.status).json(result.data);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// DELETE /api/accesses/:accessId
router.delete('/:accessId', async (req, res) => {
  try {
    const result = await apiRequest(`${BASE()}/accesses/${req.params.accessId}`, { method: 'DELETE' });
    res.status(result.status).json(result.data || {});
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// GET /api/accesses/:accessId/devices
router.get('/:accessId/devices', async (req, res) => {
  try {
    const url = new URL(`${BASE()}/accesses/${req.params.accessId}/devices`);
    await listOrPage(req, res, url, DEVICE_FILTERS);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// POST /api/accesses/:accessId/devices/add  (several devices; the body is { devices: [...] })
router.post('/:accessId/devices/add', async (req, res) => {
  try {
    console.log('[ADD DEVICES] body sent to API:', JSON.stringify(req.body, null, 2));
    const result = await apiRequest(`${BASE()}/accesses/${req.params.accessId}/devices/add`, {
      method: 'POST', body: req.body
    });
    console.log('[ADD DEVICES] API response:', result.status, JSON.stringify(result.data));
    res.status(result.status).json(result.data);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// POST /api/accesses/:accessId/devices/remove  (several devices; the body is { devices: [...] }, each a device object)
router.post('/:accessId/devices/remove', async (req, res) => {
  try {
    const result = await apiRequest(`${BASE()}/accesses/${req.params.accessId}/devices/remove`, {
      method: 'POST', body: req.body
    });
    res.status(result.status).json(result.data || {});
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

module.exports = router;
