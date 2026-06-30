<h1 align="center">CAMARA APIs Examples</h1>
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
  ConnectivityQualityManagement/
    DedicatedNetworks-management-portal/   Node.js portal for Dedicated Networks APIs
    Insomnia_Using_DedicatedNetworks.yaml  Insomnia collection — Dedicated Networks
    Insomnia_Using_QoSBooking.yaml         Insomnia collection — QoS Booking
    Insomnia_Using_QualityonDemand.yaml    Insomnia collection — Quality on Demand
```

## Contents

### Connectivity Quality Management

Examples and tools for APIs within the scope of [CAMARA Connectivity Quality Management](https://github.com/camaraproject/ConnectivityQualityManagement).

#### Dedicated Networks Management Portal

A browser-based portal for managing CAMARA Dedicated Networks. It provides a Node.js/Express backend that proxies authenticated CAMARA API calls, and a single-page frontend for:

- Browsing available service areas on an interactive map
- Viewing network profiles and QoS properties
- Creating, monitoring and deleting dedicated networks
- Managing device access to a network
- Real-time status updates with adaptive polling (5 s while transitioning or near expiry, 30 s when stable)
- Alerts on network activation, expiry and termination
- One-click home tab for immediate connectivity quality provisioning

See the [portal README](./ConnectivityQualityManagement/DedicatedNetworks-management-portal/README.md) for setup instructions.

#### Insomnia Collections

Ready-to-import API collections for [Insomnia](https://insomnia.rest/):

| File | APIs covered |
|------|-------------|
| [`Insomnia_Using_DedicatedNetworks.yaml`](./ConnectivityQualityManagement/Insomnia_Using_DedicatedNetworks.yaml) | Dedicated Networks, Profiles, Accesses |
| [`Insomnia_Using_QoSBooking.yaml`](./ConnectivityQualityManagement/Insomnia_Using_QoSBooking.yaml) | QoS Booking |
| [`Insomnia_Using_QualityonDemand.yaml`](./ConnectivityQualityManagement/Insomnia_Using_QualityonDemand.yaml) | Quality on Demand |
