/*
License: 5G-MAG Public License (v1.0)
Author: Jordi Joan Gimenez
Copyright: (C) 2026 5G-MAG Association

For full license terms please see the LICENSE file distributed with this
program. If this file is missing then the license can be retrieved from
https://hub.5g-mag.com/Getting-Started/OFFICIAL_5G-MAG_Public_License_v1.0.pdf
*/

// Runs the portal's API layer against a fake CAMARA server that answers in two forms: the form the
// Dedicated Networks specification defines (release r2.2, 0.2.0-rc.1: paged lists, `devices`, a network `name`) and
// the earlier form of the sandbox (bare arrays, one `device`, no `name`). Run with: npm test

const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');

let server, base, mode = 'spec', calls = [];

function reply(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(body === undefined ? '' : JSON.stringify(body));
}

test.before(async () => {
  server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', c => { raw += c; });
    req.on('end', () => {
      const url = new URL(req.url, 'http://x');
      const body = raw && req.headers['content-type'] === 'application/json' ? JSON.parse(raw) : null;
      calls.push({ method: req.method, path: url.pathname, query: Object.fromEntries(url.searchParams), body, xDevice: req.headers['x-device'] });
      if (url.pathname === '/token') return reply(res, 200, { access_token: 't', expires_in: 3600 });
      if (req.method === 'GET' && url.pathname === '/items') {
        const page = Number(url.searchParams.get('page'));
        const perPage = Number(url.searchParams.get('perPage'));
        const all = Array.from({ length: 5 }, (_, i) => ({ id: i + 1 }));
        if (mode === 'legacy') return reply(res, 200, all);              // a bare array; page and perPage ignored
        const items = all.slice((page - 1) * perPage, page * perPage);
        return reply(res, 200, { items, pagination: { page, perPage, totalCount: 5, totalPages: Math.ceil(5 / perPage) } });
      }
      if (req.method === 'POST' && url.pathname === '/networks') {
        if (mode === 'legacy' && body.name) return reply(res, 400, { status: 400, code: 'INVALID_ARGUMENT', message: "Property 'name' is unrecognized" });
        return reply(res, 201, { ...body, id: 'n1', status: 'REQUESTED' });
      }
      if (req.method === 'POST' && url.pathname === '/accesses') {
        if (mode === 'legacy') {
          if (!body.device) return reply(res, 400, { status: 400, code: 'INVALID_ARGUMENT', message: "Required property 'device' is missing" });
          if (body.name) return reply(res, 400, { status: 400, code: 'INVALID_ARGUMENT', message: "Property 'name' is unrecognized" });
          return reply(res, 201, { ...body, id: 'a1', status: 'REQUESTED' });
        }
        const added = (body.devices || []).map(d => ({ device: d, status: 'REQUESTED' }));
        return reply(res, 201, {
          id: 'a1', networkId: body.networkId, stats: { totalDevices: added.length, totalGranted: 0, totalDenied: 0 }, recentAccessDevices: added
        });
      }
      reply(res, 404, 'No matching api service');
    });
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
  Object.assign(process.env, {
    TOKEN_URL: `${base}/token`, CLIENT_ID: 'id', CLIENT_SECRET: 'secret', ACCESSES_URL: base, NETWORKS_URL: base
  });
});
test.after(() => server.close());
test.beforeEach(() => { calls = []; });

const { listPages, postDroppingUnsupported } = require('../services/apiService');
const { createAccess, toSpecBody, withDeviceStatus } = require('../services/accessService');

test('listPages follows the pages of a paged answer', async () => {
  mode = 'spec';
  const r = await listPages(`${base}/items`, { perPage: 2 });
  assert.deepStrictEqual(r.data.map(i => i.id), [1, 2, 3, 4, 5]);
  const pages = calls.filter(c => c.path === '/items').map(c => c.query.page);
  assert.deepStrictEqual(pages, ['1', '2', '3']);
  assert.strictEqual(r.pagination.totalCount, 5);
});

test('listPages reads a bare array as one page and does not ask again', async () => {
  mode = 'legacy';
  const r = await listPages(`${base}/items`, { perPage: 2 });
  assert.strictEqual(r.data.length, 5);
  assert.strictEqual(calls.filter(c => c.path === '/items').length, 1);
});

test('a network name is sent, and dropped only when the API does not accept it', async () => {
  mode = 'spec';
  let r = await postDroppingUnsupported(`${base}/networks`, { name: 'Final', serviceAreaId: 'a' }, ['name']);
  assert.strictEqual(r.status, 201);
  assert.deepStrictEqual(r.dropped, []);
  assert.strictEqual(r.data.name, 'Final');

  mode = 'legacy'; calls = [];
  r = await postDroppingUnsupported(`${base}/networks`, { name: 'Final', serviceAreaId: 'a' }, ['name']);
  assert.strictEqual(r.status, 201);
  assert.deepStrictEqual(r.dropped, ['name']);
  assert.strictEqual(calls.filter(c => c.path === '/networks').length, 2);
  assert.strictEqual(r.data.name, undefined);
});

test('another 400 is not retried', async () => {
  mode = 'legacy';
  const r = await postDroppingUnsupported(`${base}/accesses`, { networkId: 'n' }, ['name']);
  assert.strictEqual(r.status, 400);
  assert.strictEqual(calls.filter(c => c.path === '/accesses').length, 1);
});

test('createAccess sends a devices list and gives the answer a top-level status', async () => {
  mode = 'spec';
  const r = await createAccess({ networkId: 'n1', device: { phoneNumber: '+41795550001' } });
  assert.strictEqual(r.status, 201);
  const sent = calls.find(c => c.path === '/accesses').body;
  assert.deepStrictEqual(sent.devices, [{ phoneNumber: '+41795550001' }]);
  assert.strictEqual(sent.device, undefined);
  assert.strictEqual(r.data.status, 'REQUESTED');
  assert.deepStrictEqual(r.data.device, { phoneNumber: '+41795550001' });
  assert.strictEqual(r.singleDeviceForm, false);
});

test('createAccess falls back to one device per access for the earlier form', async () => {
  mode = 'legacy';
  const r = await createAccess({ networkId: 'n1', device: { phoneNumber: '+41795550001' } });
  assert.strictEqual(r.status, 201);
  assert.strictEqual(r.singleDeviceForm, true);
  assert.strictEqual(r.data.status, 'REQUESTED');
  const posts = calls.filter(c => c.path === '/accesses');
  assert.strictEqual(posts.length, 2);          // the specification's form, then the earlier form
  assert.deepStrictEqual(posts[1].body.device, { phoneNumber: '+41795550001' });
  assert.strictEqual(posts[1].body.devices, undefined);
});

test('createAccess with several devices on the earlier form says so and does not guess', async () => {
  mode = 'legacy';
  const r = await createAccess({ networkId: 'n1', devices: [{ phoneNumber: '+1' }, { phoneNumber: '+2' }] });
  assert.strictEqual(r.status, 422);
  assert.match(r.data.message, /one device per access/);
});

test('listPages passes headers on every request, as the x-device filter needs', async () => {
  mode = 'spec';
  await listPages(`${base}/items`, { perPage: 2, headers: { 'x-device': 'phonenumber="+41795550001"' } });
  const sent = calls.filter(c => c.path === '/items');
  assert.ok(sent.length >= 2);
  assert.ok(sent.every(c => c.xDevice === 'phonenumber="+41795550001"'));
});

test('toSpecBody and withDeviceStatus', () => {
  assert.deepStrictEqual(toSpecBody({ networkId: 'n', device: { phoneNumber: '+1' } }), { networkId: 'n', devices: [{ phoneNumber: '+1' }] });
  assert.strictEqual(withDeviceStatus({ id: 'a', stats: { totalDevices: 2, totalGranted: 1, totalDenied: 0 } }).status, 'GRANTED');
  assert.strictEqual(withDeviceStatus({ id: 'a', stats: { totalDevices: 1, totalGranted: 0, totalDenied: 1 } }).status, 'DENIED');
  assert.strictEqual(withDeviceStatus({ id: 'a', status: 'GRANTED' }).status, 'GRANTED');
});
