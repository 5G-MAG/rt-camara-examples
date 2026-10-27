/*
License: 5G-MAG Public License (v1.0)
Author: Jordi Joan Gimenez
Copyright: (C) 2026 5G-MAG Association

For full license terms please see the LICENSE file distributed with this
program. If this file is missing then the license can be retrieved from
https://hub.5g-mag.com/Getting-Started/OFFICIAL_5G-MAG_Public_License_v1.0.pdf
*/

const express = require('express');
const { apiRequest, listPages, postDroppingUnsupported } = require('../services/apiService');
const { sinkFields } = require('../services/webhookService');
const router = express.Router();

const BASE = () => process.env.NETWORKS_URL;

// GET /api/networks
router.get('/', async (req, res) => {
  try {
    const url = new URL(`${BASE()}/networks`);
    if (req.query.name) url.searchParams.set('name', req.query.name);
    if (req.query.page) {
      // one page, as the API gives it
      ['page', 'perPage'].forEach(n => { if (req.query[n]) url.searchParams.set(n, req.query[n]); });
      const one = await apiRequest(url.toString(), { method: 'GET' });
      return res.status(one.status).json(one.data);
    }
    const result = await listPages(url.toString(), { perPage: Number(req.query.perPage) || undefined });
    res.status(result.status).json(result.data);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// POST /api/networks  — automatically injects sink URL
router.post('/', async (req, res) => {
  try {
    const body = { ...req.body };
    Object.assign(body, sinkFields('networks', req.body));
    // `name` is sent as the specification defines it; a deployment that does not accept it gets the request again without it
    const result = await postDroppingUnsupported(`${BASE()}/networks`, body, ['name']);
    if (result.dropped.length) res.set('X-Portal-Dropped', result.dropped.join(','));
    res.status(result.status).json(result.data);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// GET /api/networks/:networkId
router.get('/:networkId', async (req, res) => {
  try {
    const result = await apiRequest(`${BASE()}/networks/${req.params.networkId}`, {
      method: 'GET'
    });
    res.status(result.status).json(result.data);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// DELETE /api/networks/:networkId
router.delete('/:networkId', async (req, res) => {
  try {
    const result = await apiRequest(`${BASE()}/networks/${req.params.networkId}`, {
      method: 'DELETE'
    });
    res.status(result.status).json(result.data || {});
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

module.exports = router;
