/*
License: 5G-MAG Public License (v1.0)
Author: Jordi Joan Gimenez
Copyright: (C) 2026 5G-MAG Association

For full license terms please see the LICENSE file distributed with this
program. If this file is missing then the license can be retrieved from
https://hub.5g-mag.com/Getting-Started/OFFICIAL_5G-MAG_Public_License_v1.0.pdf

Shared "callback configuration" (sink + sinkCredential) form fragment, used
identically by the Network and Access create forms — the SinkCredential
schema (PLAIN / ACCESSTOKEN / REFRESHTOKEN) is byte-for-byte duplicated
between dedicated-network.yaml and dedicated-network-accesses.yaml.
Collapsed by default via the shared .advanced-fields <details> pattern.
*/

const CRED_FIELDS = {
  PLAIN: [
    { id: 'identifier', label: 'Identifier', type: 'text' },
    { id: 'secret', label: 'Secret', type: 'text' }
  ],
  ACCESSTOKEN: [
    { id: 'accessToken', label: 'Access token', type: 'text' },
    { id: 'accessTokenExpiresUtc', label: 'Expires (UTC, ISO 8601)', type: 'text', placeholder: '2026-01-01T00:00:00Z' }
  ],
  REFRESHTOKEN: [
    { id: 'accessToken', label: 'Access token', type: 'text' },
    { id: 'accessTokenExpiresUtc', label: 'Expires (UTC, ISO 8601)', type: 'text', placeholder: '2026-01-01T00:00:00Z' },
    { id: 'refreshToken', label: 'Refresh token', type: 'text' },
    { id: 'refreshTokenEndpoint', label: 'Refresh token endpoint (URL)', type: 'text' }
  ]
};

export function renderCallbackConfig(container, idPrefix) {
  container.innerHTML = `
    <details class="advanced-fields">
      <summary>Callback (webhook) configuration</summary>
      <div class="form-row">
        <label class="form-label" for="${idPrefix}-sink">Sink URL</label>
        <input type="text" id="${idPrefix}-sink" placeholder="https://example.com/webhook" />
        <p class="form-hint">Optional — leave blank to use this portal's default webhook receiver.</p>
      </div>
      <div class="form-row">
        <label class="form-label" for="${idPrefix}-cred-type">Sink credential</label>
        <select id="${idPrefix}-cred-type">
          <option value="">None</option>
          <option value="PLAIN">Plain (identifier + secret)</option>
          <option value="ACCESSTOKEN">Access token</option>
          <option value="REFRESHTOKEN">Refresh token</option>
        </select>
      </div>
      <div id="${idPrefix}-cred-fields"></div>
    </details>
  `;

  const credTypeSel = container.querySelector(`#${idPrefix}-cred-type`);
  const fieldsEl = container.querySelector(`#${idPrefix}-cred-fields`);
  const sinkInput = container.querySelector(`#${idPrefix}-sink`);

  function renderFields(type) {
    const fields = CRED_FIELDS[type];
    if (!fields) { fieldsEl.innerHTML = ''; return; }
    fieldsEl.innerHTML = fields.map(f => `
      <div class="form-row">
        <label class="form-label" for="${idPrefix}-cred-${f.id}">${f.label}</label>
        <input type="text" id="${idPrefix}-cred-${f.id}" ${f.placeholder ? `placeholder="${f.placeholder}"` : ''} />
      </div>
    `).join('');
  }
  credTypeSel.addEventListener('change', () => renderFields(credTypeSel.value));

  return {
    reset() {
      sinkInput.value = '';
      credTypeSel.value = '';
      fieldsEl.innerHTML = '';
      container.querySelector('details').open = false;
    },
    /** Returns { sink?, sinkCredential? } — only fields the user actually filled in. */
    getValue() {
      const out = {};
      const sink = sinkInput.value.trim();
      if (sink) out.sink = sink;
      const type = credTypeSel.value;
      if (type && CRED_FIELDS[type]) {
        const cred = { credentialType: type };
        if (type === 'ACCESSTOKEN' || type === 'REFRESHTOKEN') cred.accessTokenType = 'bearer';
        let complete = true;
        CRED_FIELDS[type].forEach(f => {
          const el = container.querySelector(`#${idPrefix}-cred-${f.id}`);
          const v = el ? el.value.trim() : '';
          if (!v) complete = false;
          cred[f.id] = v;
        });
        if (complete) out.sinkCredential = cred;
      }
      return out;
    }
  };
}
