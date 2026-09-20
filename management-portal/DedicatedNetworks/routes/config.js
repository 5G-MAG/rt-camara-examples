/*
License: 5G-MAG Public License (v1.0)
Author: Jordi Joan Gimenez
Copyright: (C) 2026 5G-MAG Association

For full license terms please see the LICENSE file distributed with this
program. If this file is missing then the license can be retrieved from
https://hub.5g-mag.com/Getting-Started/OFFICIAL_5G-MAG_Public_License_v1.0.pdf

Lets the Config tab read/change the CAMARA endpoint URLs and OAuth2
credentials without hand-editing .env. Persists to .env (so it survives a
restart) and updates process.env immediately (so it doesn't require one).

This endpoint has no auth of its own, same as every other route in this
portal — acceptable for a local/trusted dev tool, but worth keeping in mind
if this is ever exposed beyond localhost. CLIENT_SECRET is write-only: GET
never returns its value, only whether one is set.
*/

const express = require('express');
const fs = require('fs');
const path = require('path');
const { clearToken } = require('../services/tokenService');
const router = express.Router();

const ENV_PATH = path.join(__dirname, '..', '.env');

// Keys the Config tab is allowed to read/write. PORT is deliberately
// excluded — changing it wouldn't take effect without a real restart of the
// already-bound HTTP server.
const PLAIN_KEYS = ['CLIENT_ID', 'TOKEN_URL', 'AREAS_URL', 'NETWORKS_URL', 'PROFILES_URL', 'ACCESSES_URL', 'QOD_URL', 'SINK_BASE_URL'];
const SECRET_KEY = 'CLIENT_SECRET';
// Changing any of these invalidates the cached OAuth2 token.
const TOKEN_AFFECTING = ['CLIENT_ID', 'TOKEN_URL'];

function readEnvLines() {
  try { return fs.readFileSync(ENV_PATH, 'utf8').split('\n'); } catch (_) { return []; }
}

// Updates (or appends) KEY=value lines in .env, leaving comments/formatting
// of every other line untouched.
function writeEnvUpdates(updates) {
  const lines = readEnvLines();
  const seen = new Set();
  const out = lines.map(line => {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=/);
    if (m && Object.prototype.hasOwnProperty.call(updates, m[1])) {
      seen.add(m[1]);
      return `${m[1]}=${updates[m[1]]}`;
    }
    return line;
  });
  Object.keys(updates).forEach(key => {
    if (!seen.has(key)) out.push(`${key}=${updates[key]}`);
  });
  // Avoid a runaway blank-line tail if the original file had one.
  while (out.length > 1 && out[out.length - 1] === '' && out[out.length - 2] === '') out.pop();
  fs.writeFileSync(ENV_PATH, out.join('\n'));
}

router.get('/', (req, res) => {
  const config = {};
  PLAIN_KEYS.forEach(k => { config[k] = process.env[k] || ''; });
  config.CLIENT_SECRET_SET = !!process.env[SECRET_KEY];
  res.json(config);
});

router.post('/', (req, res) => {
  const body = req.body || {};
  const updates = {};

  for (const key of PLAIN_KEYS) {
    if (typeof body[key] === 'string') updates[key] = body[key].trim();
  }
  // Only touch the secret if the caller actually sent a new one.
  if (typeof body[SECRET_KEY] === 'string' && body[SECRET_KEY].trim()) {
    updates[SECRET_KEY] = body[SECRET_KEY].trim();
  }

  if (!Object.keys(updates).length) {
    return res.status(400).json({ error: 'No recognized config fields in request body.' });
  }

  try {
    writeEnvUpdates(updates);
  } catch (err) {
    return res.status(500).json({ error: 'Failed to write .env: ' + err.message });
  }

  Object.keys(updates).forEach(key => { process.env[key] = updates[key]; });
  if (Object.keys(updates).some(k => TOKEN_AFFECTING.includes(k) || k === SECRET_KEY)) {
    clearToken();
  }

  const config = {};
  PLAIN_KEYS.forEach(k => { config[k] = process.env[k] || ''; });
  config.CLIENT_SECRET_SET = !!process.env[SECRET_KEY];
  res.json(config);
});

module.exports = router;
