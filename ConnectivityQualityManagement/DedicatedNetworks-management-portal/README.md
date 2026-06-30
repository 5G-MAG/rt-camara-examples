# 5G-MAG · CAMARA Dedicated Networks Management Portal

A browser-based management portal for [CAMARA Dedicated Networks APIs](https://github.com/camaraproject/ConnectivityQualityManagement). It provides a Node.js/Express backend that proxies authenticated CAMARA API calls, and a single-page frontend for the full dedicated network lifecycle.

## Features

- **Service areas** — browse available areas on an interactive map with polygon overlays
- **Network profiles** — view available profiles and their QoS properties via a modal
- **Create networks** — reserve a dedicated network for a selected area, profile and time window
- **Monitor status** — real-time status updates with adaptive polling (5 s while transitioning or near expiry, 30 s when stable)
- **Device access** — create and manage device access grants within a network
- **QoS sessions** — book and manage Quality on Demand sessions per device
- **Alerts** — automatic prompts on network activation and on approaching expiry; polling continues at 5 s until the network reaches TERMINATED
- **Webhook notifications** — receives inbound CAMARA notifications and surfaces them in the UI
- **Home tab** — one-click flow to obtain connectivity quality immediately (create network + access in a single form)
- **Offline-ready** — Leaflet and geocoder assets are bundled locally; no CDN dependency at runtime

## Quick start

### 1. Configure credentials

```bash
cp .env.example .env
# Edit .env — fill in CLIENT_ID, CLIENT_SECRET, TOKEN_URL and the API base URLs
```

### 2. Install dependencies

```bash
npm install
```

### 3. Start the server

```bash
node server.js
```

Open **http://localhost:3001** in your browser.

### 4. (Optional) Expose for webhook notifications

```bash
npx localtunnel --port 3001
# Copy the tunnel URL into .env as SINK_BASE_URL and restart the server
```

## Environment variables

| Variable | Description |
|----------|-------------|
| `CLIENT_ID` | OAuth2 client ID |
| `CLIENT_SECRET` | OAuth2 client secret |
| `TOKEN_URL` | OAuth2 token endpoint |
| `AREAS_URL` | Base URL for the Dedicated Network Areas API |
| `NETWORKS_URL` | Base URL for the Dedicated Network API |
| `PROFILES_URL` | Base URL for the Dedicated Network Profiles API |
| `ACCESSES_URL` | Base URL for the Dedicated Network Accesses API |
| `QOD_URL` | Base URL for the Quality on Demand API |
| `PORT` | Server port (default: 3001) |
| `SINK_BASE_URL` | Public base URL for inbound webhook notifications |

## Project structure

```
DedicatedNetworks-management-portal/
  .env.example              All required environment variables (no secrets)
  server.js                 Express entry point (port 3001)
  public/
    index.html              Single-page portal UI
    5gmag.png               Logo (replace to customise)
    lib/                    Locally bundled Leaflet and geocoder assets
      leaflet.js / .css
      Control.Geocoder.js / .css
      images/               Map marker and layer icons
  routes/
    areas.js                GET /api/areas, POST /api/areas/retrieve
    networks.js             CRUD /api/networks
    accesses.js             CRUD /api/accesses + device management
    profiles.js             GET /api/profiles/network, /api/profiles/qos
    sessions.js             CRUD /api/sessions
    webhooks.js             POST /webhooks (inbound), GET /api/webhooks/notifications
  services/
    tokenService.js         OAuth2 token cache with auto-refresh
    apiService.js           Authenticated fetch wrapper
    webhookService.js       Inbound notification store
```

## API routes

| Method | Path | Description |
|--------|------|-------------|
| POST | /api/areas/retrieve | Retrieve service areas |
| GET | /api/areas/:id | Get a specific area |
| GET | /api/networks | List networks |
| POST | /api/networks | Create network |
| GET | /api/networks/:id | Get network |
| DELETE | /api/networks/:id | Delete network |
| GET | /api/accesses | List accesses |
| POST | /api/accesses | Create access |
| GET | /api/accesses/:id | Get access |
| DELETE | /api/accesses/:id | Delete access |
| GET | /api/accesses/:id/devices | List devices in access |
| POST | /api/accesses/:id/devices/add | Add devices to access |
| POST | /api/accesses/:id/devices/remove | Remove devices from access |
| GET | /api/profiles/network | List network profiles |
| GET | /api/profiles/qos | List QoS profiles |
| POST | /api/sessions | Create QoS session |
| GET | /api/sessions/:id | Get session |
| DELETE | /api/sessions/:id | Delete session |
| POST | /api/sessions/:id/extend | Extend session |
| POST | /webhooks/:resource | Inbound notifications from CAMARA |
| GET | /api/webhooks/notifications | Poll notifications (frontend) |
| GET | /health | Server and environment health check |
