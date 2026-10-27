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

/**
 * Reads a list endpoint and returns every item as one array.
 *
 * The CAMARA Dedicated Networks APIs answer with a page, { items, pagination }, where pagination holds
 * page, perPage, totalCount and totalPages; the request asks for a page with the page and perPage query
 * parameters. The loop follows totalPages. A deployment that still answers with a bare array is read as
 * one single page and not asked again, since it ignores page and perPage.
 *
 * @param {string} url      - Full URL to call, with any filter already in its query
 * @param {object} options  - method, body, headers, perPage (default 100), maxPages (default 50)
 * @returns {Promise<{status, ok, data: Array, pagination: object|null}>} data is the array of items;
 *          on an error response the error response itself is returned
 */
async function listPages(url, { method = 'GET', body, headers, perPage = 100, maxPages = 50 } = {}) {
  const items = [];
  let pagination = null;
  for (let page = 1; page <= maxPages; page++) {
    const u = new URL(url);
    u.searchParams.set('page', String(page));
    u.searchParams.set('perPage', String(perPage));
    const r = await apiRequest(u.toString(), { method, body, headers });
    if (!r.ok) return r;
    if (Array.isArray(r.data)) return { status: r.status, ok: true, data: items.concat(r.data), pagination };
    const pageItems = r.data && Array.isArray(r.data.items) ? r.data.items : [];
    items.push(...pageItems);
    pagination = (r.data && r.data.pagination) || null;
    const totalPages = pagination && Number(pagination.totalPages);
    if (!totalPages || page >= totalPages || !pageItems.length) {
      return { status: r.status, ok: true, data: items, pagination };
    }
  }
  return { status: 200, ok: true, data: items, pagination };
}

/**
 * Sends a POST. If the API answers 400 or 422 and names an optional property as not recognised, sends the
 * request again without that property. This keeps one request body, the one the specification defines, for
 * deployments that do not accept every property yet.
 *
 * @param {string} url       - Full URL to call
 * @param {object} body      - Request body
 * @param {string[]} optional - Properties that may be dropped
 * @returns {Promise<{status, ok, data, dropped: string[]}>}
 */
async function postDroppingUnsupported(url, body, optional = []) {
  let r = await apiRequest(url, { method: 'POST', body });
  r.dropped = [];
  if ((r.status === 400 || r.status === 422) && optional.length) {
    const message = typeof r.data === 'string' ? r.data : JSON.stringify(r.data);
    const unknown = optional.filter(prop =>
      Object.prototype.hasOwnProperty.call(body, prop) &&
      new RegExp(`['"\`]${prop}['"\`][^.]*(unrecognized|unrecognised|unknown|not allowed|additional)|(unrecognized|unrecognised|unknown|not allowed|additional)[^.]*['"\`]${prop}['"\`]`, 'i').test(message));
    if (unknown.length) {
      const reduced = { ...body };
      unknown.forEach(prop => delete reduced[prop]);
      r = await apiRequest(url, { method: 'POST', body: reduced });
      r.dropped = unknown;
    }
  }
  return r;
}

module.exports = { apiRequest, listPages, postDroppingUnsupported };
