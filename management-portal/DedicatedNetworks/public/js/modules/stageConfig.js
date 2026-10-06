/*
License: 5G-MAG Public License (v1.0)
Author: Jordi Joan Gimenez
Copyright: (C) 2026 5G-MAG Association

For full license terms please see the LICENSE file distributed with this
program. If this file is missing then the license can be retrieved from
https://hub.5g-mag.com/Getting-Started/OFFICIAL_5G-MAG_Public_License_v1.0.pdf

Config tab — CAMARA endpoint URLs and OAuth2 credentials, editable from the
UI instead of only by hand-editing .env (routes/config.js persists to .env
and applies changes immediately, no restart needed).
*/

import { Api } from './api.js';
import { setSt, clrSt } from './uiCommon.js';

const FIELD_IDS = {
  CLIENT_ID: 'cfg-client-id',
  TOKEN_URL: 'cfg-token-url',
  AREAS_URL: 'cfg-areas-url',
  NETWORKS_URL: 'cfg-networks-url',
  PROFILES_URL: 'cfg-profiles-url',
  ACCESSES_URL: 'cfg-accesses-url',
  QOD_URL: 'cfg-qod-url',
  SINK_BASE_URL: 'cfg-sink-url'
};

export function initStageConfig() {
  let loaded = false;

  async function load() {
    clrSt('config-status');
    const r = await Api.getConfig();
    if (!r.ok) { setSt('config-status', 'Could not load config: HTTP ' + r.status, false); return; }
    Object.keys(FIELD_IDS).forEach(key => { document.getElementById(FIELD_IDS[key]).value = r.data[key] || ''; });
    document.getElementById('cfg-client-secret').value = '';
    document.getElementById('cfg-secret-hint').textContent = r.data.CLIENT_SECRET_SET
      ? 'A secret is currently set. Write-only — never shown back. Leave blank to keep it.'
      : 'No secret currently set.';
    loaded = true;
  }

  document.getElementById('config-reload-btn').addEventListener('click', load);

  document.getElementById('config-save-btn').addEventListener('click', async function () {
    const btn = this;
    const body = {};
    Object.keys(FIELD_IDS).forEach(key => { body[key] = document.getElementById(FIELD_IDS[key]).value; });
    const secret = document.getElementById('cfg-client-secret').value;
    if (secret) body.CLIENT_SECRET = secret;

    btn.textContent = 'Saving…'; btn.disabled = true;
    const r = await Api.saveConfig(body);
    btn.disabled = false; btn.textContent = 'Save';
    if (!r.ok) { setSt('config-status', 'HTTP ' + r.status + ': ' + (r.data.message || r.data.error || 'Error'), false); return; }
    setSt('config-status', 'Saved. Applied immediately — no restart needed.', true);
    window.showToast('Configuration saved.', 'success');
    document.getElementById('cfg-client-secret').value = '';
    document.getElementById('cfg-secret-hint').textContent = r.data.CLIENT_SECRET_SET
      ? 'A secret is currently set. Write-only — never shown back. Leave blank to keep it.'
      : 'No secret currently set.';
  });

  return {
    activate() { if (!loaded) load(); },
    deactivate() {}
  };
}
