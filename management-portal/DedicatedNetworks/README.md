# Dedicated Networks Portal

A guided, browser-based portal for the CAMARA Dedicated Networks APIs — Areas, Networks,
Accesses and Profiles — plus a one-click Quick Booking shortcut.

## At a glance

|  |  |
|---|---|
| **Implements** | [CAMARA Dedicated Networks APIs](https://github.com/camaraproject/DedicatedNetworks) — Areas, Networks, Accesses and Profiles |
| **Code type** | Reference implementation: a Node.js/Express backend that proxies authenticated CAMARA API calls, plus a dependency-light single-page frontend |
| **Part of** | [rt-camara-examples](https://github.com/5G-MAG/rt-camara-examples), alongside the Insomnia collections for CAMARA APIs |

## Introduction

The portal walks a user through the full dedicated-network lifecycle as one guided flow —
**Areas → Network → Access → Devices** — where each stage is disabled with a one-line reason
until its prerequisite is done, and exercises the full parameter surface of its CAMARA API rather
than a cut-down subset. A **Quick Booking** tab sits alongside it for the one-click case (pick a
point on the map, set a phone number and a time window, get a network + access in one request);
both share the same state, so a network booked via Quick Booking shows up already unlocked in
Devices.

- **Service areas** — search by point, drawn circle or polygon (overlapping/covering), or by
  name / network-profile / QoS-profile filters, combinable
- **Networks** — reserve by network profile *or* QoS profile, for a chosen area and time window,
  with optional callback (webhook) configuration
- **Accesses & Devices** — grant a local device identity access to a network; a full lifecycle
  tracker shows every possible status as a row of badges, with the current one highlighted, so
  progress is never ambiguous
- **Live status** — adaptive polling (fast while transitioning or near expiry, slow once stable)
- **Dark mode**, offline-bundled map assets, no CDN dependency at runtime

The UI reuses the shared 5G-MAG reference-tools look — the same `blue-bar.css` and `style.css`
vocabulary as `rt-mbs-application-provider` / `rt-media-server` (copied, not reinvented): a
blue-bar header, `.card` / `.badge` / `.form-row` throughout, native `<dialog>` / `confirm()`,
and a single toast.

## Specification

Implements the 4 sub-APIs published in
[camaraproject/DedicatedNetworks](https://github.com/camaraproject/DedicatedNetworks):
Areas, Networks, Accesses and Profiles.

## Install dependencies

Node.js LTS and npm — no other system packages required.

## Downloading

```bash
cd ~
git clone https://github.com/5G-MAG/rt-camara-examples.git
cd rt-camara-examples/management-portal/DedicatedNetworks
```

## Building

No build step — plain Node.js on the backend, vanilla JS/CSS served as static files on the
frontend.

## Installing

```bash
npm install
```

## Running

```bash
cp .env.example .env
# fill in CLIENT_ID, CLIENT_SECRET, TOKEN_URL and the 4 CAMARA API base URLs
node server.js
```

Open **http://localhost:3001**.

## Configuration

All configuration is via `.env` (copied from `.env.example`); the OAuth2 credentials and CAMARA
base URLs can also be viewed and edited live from the portal's own **Config** tab.

| Variable | Description |
|----------|-------------|
| `CLIENT_ID` | OAuth2 client ID |
| `CLIENT_SECRET` | OAuth2 client secret |
| `TOKEN_URL` | OAuth2 token endpoint |
| `AREAS_URL` | Base URL for the Dedicated Network Areas API |
| `NETWORKS_URL` | Base URL for the Dedicated Network API |
| `PROFILES_URL` | Base URL for the Dedicated Network Profiles API |
| `ACCESSES_URL` | Base URL for the Dedicated Network Accesses API |
| `QOD_URL` | Base URL for the Quality on Demand API (used by the separate, unexposed Sessions route) |
| `PORT` | Server port (default: 3001) |
| `SINK_BASE_URL` | Public base URL for inbound webhook notifications |

For webhook notifications during local development, expose the server with a tunnel first:

```bash
npx localtunnel --port 3001
# copy the tunnel URL into .env as SINK_BASE_URL and restart
```

## Development

```
management-portal/DedicatedNetworks/
  server.js                 Express entry point
  public/
    index.html              Shell: blue-bar header, tab-nav, per-tab <main> panels
    blue-bar.css             5G-MAG header component, copied verbatim from the reference tools
    style.css                 Shared 5G-MAG look (cards/badges/forms/toast/dark mode)
    js/
      app.js                  Entry point (type="module"): tabs, theme toggle, toast, health dots
      modules/
        wizard.js               Shared Guided-Setup / Quick-Booking state + tab locking
        api.js                   Fetch wrappers to /api/*
        polling.js               One adaptive-pace polling utility for every tab
        uiCommon.js               Formatting, badge helpers, lifecycle tracker
        callbackConfig.js         Shared sink/sinkCredential form fragment
        devicePool.js             Local device-identity pool
        stageAreas.js / stageNetwork.js / stageAccess.js / stageDevices.js
        quickBooking.js           Quick Booking tab
    lib/                     Locally bundled Leaflet + geocoder (no CDN at runtime)
  routes/                    areas.js, networks.js, accesses.js, profiles.js, config.js,
                             sessions.js (QoD, unexposed in the UI), webhooks.js
  services/                  tokenService.js (OAuth2 cache), apiService.js, webhookService.js
```

No automated test suite yet; verification has been manual/exploratory against the live sandbox.

## Contributing

Contributions are welcome. How to raise an issue, fork the repository and open a pull request,
and the Contributor License Agreement required before code can be merged, are described at
<https://www.5g-mag.com/contributing>.

## License

Distributed under the 5G-MAG Public License v1.0. See [LICENSE](../../LICENSE).
