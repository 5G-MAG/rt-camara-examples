# CAMARA Dedicated Networks — MCP Server (Python)

A Python MCP server that lets Claude Desktop call the four CAMARA Dedicated Networks APIs directly.

---

## API versions

This server was built against the following CAMARA API definitions (OpenAPI `3.0.3`):

| API | Title | API version | Path version | Commonalities |
|-----|-------|-------------|--------------|---------------|
| Networks | `Dedicated Network - Networks` | `wip` | `v0` | `0.6` |
| Network Profiles | `Dedicated Network - Network Profiles` | `wip` | `v0` | `0.6` |
| Device Accesses | `Dedicated Network - Accesses` | `wip` | `v0` | `0.6` |
| Service Areas | `Dedicated Network - Areas` | `wip` | `v0` | `0.6` |

> `wip` ("work in progress") is the version label carried in the CAMARA source specs at the time this server was built. As the CAMARA APIs stabilise into numbered releases, update the tool implementations accordingly.

---

## Concepts

| Term | Description |
|---|---|
| **Network** | A reserved slice of radio resources, tied to a geographic area and a time window. |
| **Profile** | A blueprint describing what a network can deliver (device limit, throughput, QoS options). |
| **Access** | A grant allowing a specific device to connect to a network. |
| **Service Area** | A geographic region with consistent dedicated-network coverage. |
| **serviceAreaId** | UUID from `camara_retrieve_service_areas` — required to create a network. |
| **networkProfileId** | UUID from `camara_list_profiles` — one of two ways to configure a network. |
| **qosProfileName** | String name — simplified alternative to a profile UUID (single-device networks only). |

### Network lifecycle

```
REQUESTED → RESERVED → ACTIVATED → TERMINATED
              (future)   (live)      (ended)
```

### Access lifecycle

```
REQUESTED → GRANTED
           REJECTED
```

---

## Tools

This server exposes **12 tools** across four functional groups.

| Tool | Group | What it does |
|------|-------|-------------|
| `camara_list_profiles` | Profiles | List available network profiles |
| `camara_get_profile` | Profiles | Get details of a specific profile |
| `camara_retrieve_service_areas` | Areas | Search geographic service areas |
| `camara_get_area` | Areas | Get details of a specific service area |
| `camara_list_networks` | Networks | List all your dedicated networks |
| `camara_get_network` | Networks | Get status/details of one network |
| `camara_create_network` | Networks | Create a new dedicated network |
| `camara_delete_network` | Networks | Cancel/delete a network |
| `camara_list_accesses` | Accesses | List device access grants |
| `camara_get_access` | Accesses | Check if a device access is granted/denied |
| `camara_create_access` | Accesses | Grant a device access to a network |
| `camara_delete_access` | Accesses | Revoke a device's access |

---

## Requirements

- **Python 3.10 or newer**
- **pip** (Python's package manager)

---

## Installation

### 1. Open a terminal / Command Prompt

On Windows: press `Win + R`, type `cmd`, press Enter.

### 2. Install the dependencies

```bash
cd path\to\camara-dedicated-networks-mcp-python
pip install -r requirements.txt
```

This installs three packages:
- `mcp[cli]` — the MCP framework (registers tools for Claude)
- `httpx` — the async HTTP client (makes API calls)
- `pydantic` — validates the inputs Claude sends to each tool

### 3. Test that it runs

```bash
python server.py
```

You should see a line like:
```
[camara-mcp] Starting | API root: http://localhost:9091 | Auth: NO TOKEN
```
(Press Ctrl+C to stop.)

---

## Configure Claude Desktop

Open your Claude Desktop config file:

- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`
  (paste `%APPDATA%\Claude\claude_desktop_config.json` into the Explorer address bar)
- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`

Add the following block inside `"mcpServers"` (create the file if it does not exist):

```json
{
  "mcpServers": {
    "camara-dedicated-networks": {
      "command": "python",
      "args": [
        "C:\\path\\to\\camara-dedicated-networks-mcp-python\\server.py"
      ],
      "env": {
        "CAMARA_API_ROOT": "https://your-api-server.example.com",
        "CAMARA_ACCESS_TOKEN": "your-bearer-token-here"
      }
    }
  }
}
```

> **Replace** `CAMARA_API_ROOT` with the real URL of your CAMARA API server.
> **Replace** `CAMARA_ACCESS_TOKEN` with your bearer token.

Then **restart Claude Desktop**.

---

## Configure OpenCode

[OpenCode](https://opencode.ai) reads MCP server definitions from an `opencode.json` (or `opencode.jsonc`) config file:

- **Project-level**: `opencode.json` in your project root (highest precedence).
- **Global**: `~/.config/opencode/opencode.json`.

Add the following block (create the file if it does not exist):

```json
{
  "mcp": {
    "camara-dedicated-networks": {
      "type": "local",
      "command": [
        "python",
        "C:\\path\\to\\camara-dedicated-networks-mcp-python\\server.py"
      ],
      "enabled": true,
      "environment": {
        "CAMARA_API_ROOT": "https://your-api-server.example.com",
        "CAMARA_ACCESS_TOKEN": "your-bearer-token-here"
      }
    }
  }
}
```

> **Replace** `CAMARA_API_ROOT` with the real URL of your CAMARA API server.
> **Replace** `CAMARA_ACCESS_TOKEN` with your bearer token.
> On macOS/Linux, use a forward-slash path (e.g. `/path/to/camara-dedicated-networks-mcp-python/server.py`) and, if needed, point `command` at your `python3` binary.

Restart OpenCode (or run `opencode` again) to pick up the new server. Tools then become available with the `camara-dedicated-networks_` prefix, e.g. `camara-dedicated-networks_camara_list_profiles`.

---

## Environment variables

| Variable | Description | Default |
|----------|-------------|---------|
| `CAMARA_API_ROOT` | Base URL of your CAMARA API server | `http://localhost:9091` |
| `CAMARA_ACCESS_TOKEN` | Bearer token for authentication | *(empty — no auth header sent)* |

---

## Example prompts

```
What network profiles are available?
```
```
Find service areas near latitude 50.74, longitude 7.10
```
```
Create a dedicated network using profile <id> in area <id> from 2025-06-01T09:00:00Z to 2025-06-01T17:00:00Z
```
```
List all my dedicated networks and show their status
```
```
Grant phone number +1234567890 access to network <networkId>
```
```
Is access <accessId> granted yet?
```

---

## Tool reference

### Group 1 — Networks

#### `camara_list_networks`

Lists all dedicated networks belonging to the caller.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `response_format` | `markdown` \| `json` | No | Output format. Default: `markdown`. |

**Returns** — Each network contains `id`, `status`, `serviceAreaId`, `serviceTime`, `networkProfileId` or `qosProfileName`, and `sink`.

---

#### `camara_get_network`

Fetches the current state of a single network by UUID.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `networkId` | string (UUID) | Yes | ID of the network to inspect. |
| `response_format` | `markdown` \| `json` | No | Output format. Default: `markdown`. |

**Errors** — `404` Network not found.

---

#### `camara_create_network`

Creates a new dedicated network reservation. Starts in `REQUESTED` status.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `serviceAreaId` | string (UUID) | Yes | Target geographic area (from `camara_retrieve_service_areas`). |
| `serviceTime` | `{ start, end }` | Yes | RFC 3339 timestamps with timezone offset. |
| `networkProfileId` | string (UUID) | Exclusive* | Profile UUID (from `camara_list_profiles`). |
| `qosProfileName` | string | Exclusive* | QoS profile name — simplified, single-device option. |
| `sink` | string (HTTPS URL) | No | Webhook for status-change notifications. |
| `sinkCredential` | object | No | Auth credentials for the webhook. |
| `response_format` | `markdown` \| `json` | No | Output format. Default: `markdown`. |

*Provide **exactly one** of `networkProfileId` or `qosProfileName`.

**Returns** — Created network object including its new `networkId`.

**Errors** — `400` Invalid input (bad timestamps, bad UUID, or both/neither profile fields provided).

---

#### `camara_delete_network`

Cancels a network reservation. Irreversible. Delete all device accesses first.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `networkId` | string (UUID) | Yes | ID of the network to cancel. |

**Errors** — `404` Network not found.

---

### Group 2 — Profiles

Profiles are read-only resources managed by the CSP.

#### `camara_list_profiles`

Lists all network profiles available to the caller.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `name` | string | No | Exact profile name to filter by. |
| `response_format` | `markdown` \| `json` | No | Output format. Default: `markdown`. |

**Returns** — Each profile contains `id`, `name`, `maxNumberOfDevices`, throughput budgets, `qosProfiles`, and `defaultQosProfile`.

---

#### `camara_get_profile`

Fetches full details of a single network profile by UUID.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `profileId` | string (UUID) | Yes | UUID of the profile. |
| `response_format` | `markdown` \| `json` | No | Output format. Default: `markdown`. |

**Errors** — `404` Profile not found.

---

### Group 3 — Accesses

An access grant ties a device to a network and controls which QoS profiles that device may use.

#### `camara_list_accesses`

Lists device access grants, optionally scoped to a specific network.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `networkId` | string (UUID) | No | Filter to a specific network. Omit to return all accesses. |
| `response_format` | `markdown` \| `json` | No | Output format. Default: `markdown`. |

**Returns** — Each access contains `id`, `status`, `networkId`, `device`, `defaultQosProfile`, `qosProfiles`, and `sink`.

---

#### `camara_get_access`

Fetches the current state of a single access grant by UUID.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `accessId` | string (UUID) | Yes | UUID of the access grant. |
| `response_format` | `markdown` \| `json` | No | Output format. Default: `markdown`. |

**Returns** — Full access object including `statusInfo` (reason code if `REJECTED`).

**Errors** — `404` Access not found.

---

#### `camara_create_access`

Grants a device access to a dedicated network.

**Token type determines how the device is identified:**

| Token type | `device` field |
|---|---|
| 2-legged | **Required** — provide `phoneNumber`, `ipv4Address`, or `ipv6Address`. |
| 3-legged | **Must be omitted** — device is derived from the token. |

| Parameter | Type | Required | Description |
|---|---|---|---|
| `networkId` | string (UUID) | Yes | Target network. |
| `device` | object | Conditional | Device identifier (see above). |
| `qosProfiles` | list of strings | No | Allowed QoS profiles for this device. Omit to allow all. |
| `defaultQosProfile` | string | No | Default QoS profile for this device. |
| `sink` | string (HTTPS URL) | No | Webhook for status-change notifications. |
| `sinkCredential` | object | No | Auth credentials for the webhook. |

**Returns** — Created access object with its `accessId`.

**Errors** — `400` Invalid device identifier. `404` Network not found. `422` Device identifier rule violated.

---

#### `camara_delete_access`

Revokes a device's access grant. Irreversible.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `accessId` | string (UUID) | Yes | UUID of the access grant to revoke. |

**Errors** — `404` Access not found.

---

### Group 4 — Service Areas

Service areas are read-only geographic regions defined by the CSP.

#### `camara_retrieve_service_areas`

Searches for service areas using geographic and/or profile filters. All filters are optional and AND-combined.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `atLocation` | `{ latitude, longitude }` | No | A point that must be covered by the area. |
| `overlappingArea` | `{ areaType: 'CIRCLE'\|'POLYGON', … }` | No | Shape that must overlap the area. |
| `coveringArea` | `{ areaType: 'CIRCLE'\|'POLYGON', … }` | No | Shape that the area must fully contain. |
| `byName` | string | No | Exact area name. |
| `byNetworkProfileId` | string (UUID) | No | Only areas supporting this network profile. |
| `byQosProfileName` | string | No | Only areas supporting this QoS profile name. |
| `response_format` | `markdown` \| `json` | No | Output format. Default: `markdown`. |

**Returns** — Each area contains `id`, `name`, `description`, `area` geometry, `networkProfiles`, and `qosProfiles`.

---

#### `camara_get_area`

Fetches the full details of a single service area by UUID.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `areaId` | string (UUID) | Yes | UUID of the service area. |
| `response_format` | `markdown` \| `json` | No | Output format. Default: `markdown`. |

**Errors** — `404` Area not found.

---

## Recommended workflow

### Pre-conditions (operator side)

Before calling the API, the following should already be in place:
- The API invoker has signed up with the API provider.
- QoS Profiles, Network Profiles, and Service Areas have been defined by the operator.

### Phase 1 — Before using the network

| Step | Tool | What to do |
|------|------|-----------|
| 1.1a | `camara_list_profiles` | Discover available profiles — save the `id` that fits your requirements. |
| 1.1b | `camara_retrieve_service_areas` | Find a service area covering your location — save its `id`. |
| 1.2 | `camara_create_network` | Reserve a network with `profileId`, `serviceAreaId`, and `serviceTime`. |
| 1.3 | `camara_get_network` | Monitor status: `REQUESTED → RESERVED → ACTIVATED`. |
| 1.4 | `camara_create_access` | Grant a device access using the returned `networkId`. |

### Phase 2 — During operation

| Step | Tool | What to do |
|------|------|-----------|
| 2.1 | `camara_get_network` | Confirm status is `ACTIVATED`. |
| 2.2 | `camara_create_access` / `camara_delete_access` | Add or remove devices dynamically. |
| 2.3 | `camara_get_access` | Check device access status: `REQUESTED → GRANTED / REJECTED`. |

### Phase 3 — Dismantling

| Step | Tool | What to do |
|------|------|-----------|
| 3.1 | `camara_delete_access` | Revoke each device access. |
| 3.2 | `camara_delete_network` | Cancel the network reservation. |

> **Tip:** The server also exposes four **prompts** for interactive guidance:
> `dedicated_network_workflow`, `discover_profiles_and_areas`, `manage_device_access`, `teardown_network`.

---

## Understanding the code

```
server.py                   Entry point — creates the FastMCP instance and
                            registers all tool groups and prompts.
camara/
  config.py                 Reads CAMARA_API_ROOT and CAMARA_ACCESS_TOKEN
                            from environment variables.
  client.py                 Shared async HTTP client (_api_request, _handle_error).
  models.py                 Pydantic input models shared across tools.
  formatters.py             Turns API JSON responses into readable Markdown.
  prompts.py                Registers the four workflow guidance prompts.
  tools/
    networks.py             camara_list_networks, camara_get_network,
                            camara_create_network, camara_delete_network
    profiles.py             camara_list_profiles, camara_get_profile
    accesses.py             camara_list_accesses, camara_get_access,
                            camara_create_access, camara_delete_access
    areas.py                camara_retrieve_service_areas, camara_get_area
```

Each tool follows the same pattern:
1. A **Pydantic model** validates what Claude passes in
2. The `@mcp.tool` decorator registers it with the MCP server
3. The function body calls `_api_request()` and formats the result
4. Errors are caught and turned into readable messages by `_handle_error()`

All tools accept `response_format: 'json'` to retrieve raw API payloads instead of formatted Markdown.

---

## Acknowledgement

This work has been performed in the framework of the AGENTIC6G: AUTONOMOUS MULTI-AGENT AGENTIC AI SYSTEM FOR 6G NETWORKS project (Grant Agreement No. 101290342), funded by the Smart Networks and Services Joint Undertaking (SNS JU) under the European Union's Horizon Europe research and innovation programme.

The SNS JU receives support from the European Union's Horizon Europe research and innovation programme and the SNS JU members (public and private).

Views and opinions expressed are however those of the author(s) only and do not necessarily reflect those of the European Union or the SNS JU. Neither the European Union nor the granting authority can be held responsible for them.
