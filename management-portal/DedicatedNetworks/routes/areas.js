/*
License: 5G-MAG Public License (v1.0)
Author: Jordi Joan Gimenez
Copyright: (C) 2026 5G-MAG Association

For full license terms please see the LICENSE file distributed with this
program. If this file is missing then the license can be retrieved from
https://hub.5g-mag.com/Getting-Started/OFFICIAL_5G-MAG_Public_License_v1.0.pdf
*/

const express = require('express');
const { apiRequest } = require('../services/apiService');
const router = express.Router();

const BASE = () => process.env.AREAS_URL;

// POST /api/areas/retrieve  -> POST /retrieve-service-areas
router.post('/retrieve', async (req, res) => {
  try {
    const result = await apiRequest(`${BASE()}/retrieve-service-areas`, {
      method: 'POST',
      body: req.body
    });
    res.status(result.status).json(result.data);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// GET /api/areas/:areaId  -> GET /areas/:areaId
router.get('/:areaId', async (req, res) => {
  try {
    const result = await apiRequest(`${BASE()}/areas/${req.params.areaId}`, {
      method: 'GET'
    });
    res.status(result.status).json(result.data);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

module.exports = router;
