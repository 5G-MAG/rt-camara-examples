<p align="center">
  <img src=".github/banner.svg" width="100%" alt="Reference Tools · CAMARA Connectivity Quality Management APIs: CAMARA API Tools and Examples">
</p>

<p align="center">
  Example files, tools and configurations for working with <a href="https://camaraproject.org/">CAMARA</a>
  network APIs: a management portal, Insomnia collections and an MCP server.
</p>

<p align="center">
  <img alt="Status: Under Development"
    src="https://img.shields.io/badge/Status-Under%20Development-e67e22">
  <a href="https://github.com/5G-MAG/rt-camara-examples/releases"><img alt="Version"
    src="https://img.shields.io/github/v/release/5G-MAG/rt-camara-examples?label=Version"></a>
  <a href="LICENSE"><img alt="License: 5G-MAG Public License v1.0"
    src="https://img.shields.io/badge/License-5G--MAG%20PL%20v1.0-blue"></a>
</p>

<p align="center">
  <a href="https://www.5g-mag.com/reference-tools/network-apis/">Project page</a> &nbsp;&middot;&nbsp;
  <a href="https://github.com/5G-MAG/rt-camara-examples/issues">Issues</a> &nbsp;&middot;&nbsp;
  <a href="https://www.5g-mag.com/contributing">Contributing</a>
</p>

---

## At a glance

|  |  |
|---|---|
| **Supports** | [CAMARA](https://camaraproject.org/) APIs: Dedicated Networks (Networks, Network Profiles, Device Accesses and Service Areas), QoS Booking, Quality on Demand |
| **Part of** | [CAMARA Connectivity Quality Management APIs](https://www.5g-mag.com/reference-tools/network-apis/) |

## Introduction

This repository holds example files, tools and configurations for working with
[CAMARA](https://camaraproject.org/) APIs, maintained by [5G-MAG](https://www.5g-mag.com/) as part
of its work on network API standardisation and adoption. It calls the CAMARA APIs as a client, in
three forms: a browser portal, an MCP server, and API collections for Insomnia. The portal and the
MCP server each have their own README with the setup instructions.

```
rt-camara-examples/
  management-portal/
    DedicatedNetworks/        Node.js portal for Dedicated Networks APIs
  insomnia/
    Insomnia_Using_DedicatedNetworks.yaml
    Insomnia_Using_QoSBooking.yaml
    Insomnia_Using_QualityonDemand.yaml
  mcp-servers/
    dedicated-networks/       Python MCP server for Dedicated Networks APIs
```

### Management portal: Dedicated Networks

A guided, browser-based portal for the CAMARA Dedicated Networks APIs (Areas, Networks, Accesses,
Profiles), with a one-click Quick Booking shortcut. What it does and how to run it are in the
[portal README](./management-portal/DedicatedNetworks/README.md).

### MCP server: Dedicated Networks

A [Model Context Protocol](https://modelcontextprotocol.io/) server, in Python, that exposes the
same four CAMARA Dedicated Networks APIs as tools an AI assistant, such as Claude Desktop, can call
directly. Installation, configuration and the available tools are in the
[server README](./mcp-servers/dedicated-networks/README.md).

### Insomnia collections

API collections ready to import into [Insomnia](https://insomnia.rest/):

| File | APIs covered |
|------|-------------|
| [`Insomnia_Using_DedicatedNetworks.yaml`](./insomnia/Insomnia_Using_DedicatedNetworks.yaml) | Dedicated Networks, Profiles, Accesses |
| [`Insomnia_Using_QoSBooking.yaml`](./insomnia/Insomnia_Using_QoSBooking.yaml) | QoS Booking |
| [`Insomnia_Using_QualityonDemand.yaml`](./insomnia/Insomnia_Using_QualityonDemand.yaml) | Quality on Demand |

## Contributing

Contributions are welcome. How to raise an issue, fork the repository and open a pull request, and
the Contributor License Agreement required before code can be merged, are described at
<https://www.5g-mag.com/contributing>.

## License

Distributed under the 5G-MAG Public License v1.0. See [LICENSE](LICENSE). Third-party
dependencies are listed in [ATTRIBUTION_NOTICE](ATTRIBUTION_NOTICE).
