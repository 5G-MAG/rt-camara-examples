<p align="center">
  <img src=".github/banner.svg" width="100%" alt="Reference Tools · CAMARA Connectivity Quality Management: CAMARA API Tools and Examples">
</p>

<p align="center">
  CAMARA-compliant API clients for QoS-aware media applications.
</p>

<p align="center">
  <a href="#"><img src="https://img.shields.io/badge/Status-Under_Development-yellow" alt="Under Development"></a>
  <a href="#"><!-- a href="https://github.com/5G-MAG/rt-camara-examples/releases/latest" --><img src="https://img.shields.io/badge/Version-No%20release%20yet-orange" alt="Version"><!-- img src="https://img.shields.io/github/v/release/5G-MAG/rt-camara-examples?label=Version" alt="Version" --></a>
  <a href="https://drive.google.com/file/d/1cinCiA778IErENZ3JN52VFW-1ffHpx7Z/view"><img src="https://img.shields.io/badge/License-5G--MAG%20Public%20License%20(v1.0)-blue" alt="License"></a>
</p>

## Introduction

This repository contains example files, tools and configurations for working with [CAMARA](https://camaraproject.org/) APIs. It is maintained by [5G-MAG](https://www.5g-mag.com/) as part of its work on network API standardisation and adoption.

## Repository structure

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

## Contents

### Management Portal — Dedicated Networks

A guided, browser-based portal for the CAMARA Dedicated Networks APIs (Areas, Networks,
Accesses, Profiles), plus a one-click Quick Booking shortcut.

See the [portal README](./management-portal/DedicatedNetworks/README.md) for what it does and
how to run it.

### MCP Server — Dedicated Networks (AI tool)

A Python MCP server exposing the same 4 CAMARA Dedicated Networks APIs as tools an AI agent can
call directly. Maintained separately, not part of this repository:
[aaronmontilla/camara-dedicated-networks-mcp](https://github.com/aaronmontilla/camara-dedicated-networks-mcp)
— see its [README](https://github.com/aaronmontilla/camara-dedicated-networks-mcp/blob/master/README.md)
for setup and the available tools.

### Insomnia Collections

Ready-to-import API collections for [Insomnia](https://insomnia.rest/):

| File | APIs covered |
|------|-------------|
| [`Insomnia_Using_DedicatedNetworks.yaml`](./insomnia/Insomnia_Using_DedicatedNetworks.yaml) | Dedicated Networks, Profiles, Accesses |
| [`Insomnia_Using_QoSBooking.yaml`](./insomnia/Insomnia_Using_QoSBooking.yaml) | QoS Booking |
| [`Insomnia_Using_QualityonDemand.yaml`](./insomnia/Insomnia_Using_QualityonDemand.yaml) | Quality on Demand |

### MCP Servers

[Model Context Protocol](https://modelcontextprotocol.io/) servers that let AI assistants (such as Claude Desktop) call CAMARA APIs directly as tools.

#### Dedicated Networks

A Python MCP server exposing the four CAMARA Dedicated Networks APIs (Networks, Network Profiles, Device Accesses and Service Areas) as **12 tools**, plus **4 guided workflow prompts**. It lets an assistant discover profiles and service areas, reserve and monitor dedicated networks, and grant or revoke device access through natural language.

See the [server README](./mcp-servers/dedicated-networks/README.md) for installation and configuration instructions.
