/*
License: 5G-MAG Public License (v1.0)
Author: Jordi Joan Gimenez
Copyright: (C) 2026 5G-MAG Association

For full license terms please see the LICENSE file distributed with this
program. If this file is missing then the license can be retrieved from
https://hub.5g-mag.com/Getting-Started/OFFICIAL_5G-MAG_Public_License_v1.0.pdf
*/

const fetch = require('node-fetch');
const { getToken } = require('./tokenService');

/**
 * Makes an authenticated request to a CAMARA API endpoint.
 * Automatically attaches the Bearer token.
 *
 * @param {string} url        - Full URL to call
 * @param {object} options    - fetch options (method, body, headers)
 * @returns {Promise<{status, data}>}
 */
async function apiRequest(url, options = {}) {
  const token = await getToken();

  const headers = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    'Authorization': `Bearer ${token}`,
    ...(options.headers || {})
  };

  const res = await fetch(url, {
    ...options,
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined
  });

  let data;
  const text = await res.text();
  if (!text) {
    data = {};
  } else {
    try {
      data = JSON.parse(text);
    } catch (_) {
      data = text;
    }
  }

  return { status: res.status, ok: res.ok, data };
}

module.exports = { apiRequest };
