"""
camara/tools/accesses.py
────────────────────────
MCP tools for the dedicated-network-accesses API (full lifecycle management).

API base path: /dedicated-network-accesses/vwip
Operations:
  GET    /accesses                                  → camara_list_accesses
  POST   /accesses                                  → camara_create_access
  GET    /accesses/{id}                             → camara_get_access
  DELETE /accesses/{id}                             → camara_delete_access
  GET    /accesses/{id}/devices                     → camara_list_access_devices
  POST   /accesses/{id}/devices/add                 → camara_add_devices_to_access
  POST   /accesses/{id}/devices/remove              → camara_remove_devices_from_access

Follows release r2.2 (version 0.2.0-rc.1) of camaraproject/DedicatedNetworks. An access holds a list of
devices. A deployment that still takes one device per access (and has no /devices endpoints) is served
too: create_access then sends the single `device` form.

Call register_access_tools(mcp) once from server.py to activate all the tools.
"""

import json
import re
from typing import Any, Dict, List, Optional

import httpx
from mcp.server.mcpserver import MCPServer as FastMCP

from camara.client import api_list, api_request, handle_error
from camara.formatters import fmt_access, fmt_access_device
from camara.models import (
    AddDevicesInput,
    CreateAccessInput,
    DeleteAccessInput,
    GetAccessInput,
    ListAccessDevicesInput,
    ListAccessesInput,
    RemoveDevicesInput,
    ResponseFormat,
)


NO_DEVICE_ENDPOINTS = (
    " The access was not found, or this API deployment takes one device per access and has no "
    "endpoints for the devices of an access."
)


def _device_error(e: Exception) -> str:
    """handle_error, with the reason a 404 may have on an API that has no device endpoints."""
    message = handle_error(e)
    if isinstance(e, httpx.HTTPStatusError) and e.response.status_code == 404:
        return message + NO_DEVICE_ENDPOINTS
    return message


def _wants_single_device(e: httpx.HTTPStatusError) -> bool:
    """True if the API refused the body because it wants the earlier single `device` form."""
    if e.response.status_code not in (400, 422):
        return False
    text = e.response.text
    return bool(re.search(r"['\"`]device['\"`]", text, re.I) and re.search(r"missing|required", text, re.I))


def x_device(phone_number: Optional[str]) -> Optional[Dict[str, str]]:
    """The x-device header that narrows a list to one device: the device object serialised as an RFC 8941
    dictionary, here `phonenumber="+123456789"` (a phone number is the only identifier this API supports)."""
    return {"x-device": f'phonenumber="{phone_number}"'} if phone_number else None


async def create_access_request(body: Dict[str, Any]) -> Dict[str, Any]:
    """POST /accesses with `devices`, as the specification defines it.

    An API that answers that it wants a single `device` is sent the earlier form instead, for exactly
    one device.
    """
    spec = dict(body)
    if "device" in spec and "devices" not in spec:
        spec["devices"] = [spec.pop("device")]
    try:
        return await api_request("accesses", "/accesses", method="POST", body=spec)
    except httpx.HTTPStatusError as e:
        if "devices" not in spec or not _wants_single_device(e):
            raise
        if len(spec["devices"]) != 1:
            raise ValueError(
                "This API deployment takes one device per access. Create one access for each device."
            ) from e
        earlier = {k: v for k, v in spec.items() if k != "devices"}
        earlier["device"] = spec["devices"][0]
        return await api_request("accesses", "/accesses", method="POST", body=earlier)


def register_access_tools(mcp: FastMCP) -> None:
    """Register all Device Access tools on the given FastMCP server instance."""

    # ── camara_list_accesses ───────────────────────────────────────────────────

    @mcp.tool(
        name="camara_list_accesses",
        annotations={
            "title": "List Device Accesses",
            "readOnlyHint": True,
            "destructiveHint": False,
            "idempotentHint": True,
            "openWorldHint": True,
        },
    )
    async def camara_list_accesses(params: ListAccessesInput) -> str:
        """List device access grants, optionally filtered by network.

        Access statuses:
          REQUESTED — submitted, awaiting CSP approval
          GRANTED   — device is permitted to use the dedicated network
          REJECTED  — access was denied by the CSP
          DELETED   — access has been removed

        Args:
            params.networkId (optional str): Filter results to a specific network UUID.
                Omit to return accesses across all your networks.
            params.phoneNumber (optional str): Only accesses that contain the device with this phone number.
            params.page, params.perPage (optional): Read a single page. Omit to get every access.
            params.response_format: 'markdown' (default) or 'json'.

        Returns:
            List of device accesses. Each has: id, status, networkId, device,
            defaultQosProfile, qosProfiles, sink.

        Use when:
            - "Show me all device accesses"
            - "Which devices have access to network b69e5404-...?"
        """
        try:
            query_params: Dict[str, Any] = {}
            if params.networkId:
                query_params["networkId"] = params.networkId

            accesses: List[Dict[str, Any]] = await api_list(
                "accesses", "/accesses", params=query_params,
                page=params.page, per_page=params.perPage, request=api_request,
                headers=x_device(params.phoneNumber),
            )

            if params.response_format == ResponseFormat.JSON:
                return json.dumps({"accesses": accesses, "count": len(accesses)}, indent=2)

            if not accesses:
                return "No device accesses found."
            return f"# Device Accesses ({len(accesses)})\n\n" + "\n".join(
                fmt_access(a) for a in accesses
            )

        except Exception as e:
            return handle_error(e)

    # ── camara_get_access ──────────────────────────────────────────────────────

    @mcp.tool(
        name="camara_get_access",
        annotations={
            "title": "Get Device Access",
            "readOnlyHint": True,
            "destructiveHint": False,
            "idempotentHint": True,
            "openWorldHint": True,
        },
    )
    async def camara_get_access(params: GetAccessInput) -> str:
        """Get the current details of a specific device access grant by its UUID.

        Use to check the status (REQUESTED / GRANTED / REJECTED / DELETED)
        and QoS configuration of a previously created access.

        Args:
            params.accessId (str): UUID of the device access grant.
            params.response_format: 'markdown' (default) or 'json'.

        Returns:
            Access details: id, status, networkId, device, defaultQosProfile,
            qosProfiles, statusInfo (reason code if REJECTED), sink.

        Errors:
            404 — access not found; verify the accessId UUID.

        Use when:
            - "What is the status of access c3d4e5f6-...?"
            - "Has my device access been GRANTED yet?"
        """
        try:
            access: Dict[str, Any] = await api_request(
                "accesses", f"/accesses/{params.accessId}"
            )

            if params.response_format == ResponseFormat.JSON:
                return json.dumps(access, indent=2)
            return f"# Device Access\n\n{fmt_access(access)}"

        except Exception as e:
            return handle_error(e)

    # ── camara_create_access ───────────────────────────────────────────────────

    @mcp.tool(
        name="camara_create_access",
        annotations={
            "title": "Create Device Access",
            "readOnlyHint": False,
            "destructiveHint": False,
            "idempotentHint": False,
            "openWorldHint": True,
        },
    )
    async def camara_create_access(params: CreateAccessInput) -> str:
        """Grant a device access to a dedicated network.

        An access holds a list of devices: give them in `devices` (up to 100), or one in
        `device`. The answer lists the devices accepted (`recentAccessDevices`), with `stats`;
        if only some could be added, the failed ones are listed with the reason.

        With a two-legged access token: you MUST provide the device field to
        identify which device gets access.

        With a three-legged access token: the device is derived automatically
        from the token — do NOT provide the device field.

        Optionally restrict which QoS profiles the device may use by supplying
        qosProfiles (a subset of what the network allows). Omit to allow all.

        Args:
            params.networkId (str): UUID of the dedicated network.
            params.device (optional): One device (phone number, IPv4, or IPv6).
                Required with two-legged token; omit with three-legged token.
            params.devices (optional list): Several devices to add (1-100).
            params.qosProfiles (optional list[str]): Allowed QoS profiles for this device.
            params.defaultQosProfile (optional str): Default QoS profile for this device.
            params.sink (optional str): HTTPS notification callback URL.
            params.sinkCredential (optional): Credentials for the callback.

        Returns:
            Created access with: id (store as accessId), networkId, stats, the devices
            accepted (each with its own status, starting at REQUESTED), qosProfiles.

        Errors:
            400 — invalid arguments; check device identifier format.
            404 — networkId not found; verify the network UUID.
            422 — device identifier rules violated (e.g. NAI not supported).

        Use when:
            - "Grant my phone +1234567890 access to network b69e5404-..."
            - "Allow this device to use the dedicated network"
        """
        try:
            if params.device and params.devices:
                return "Error: give either `device` or `devices`, not both."
            body: Dict[str, Any] = {"networkId": params.networkId}

            if params.device:
                body["devices"] = [params.device.model_dump(exclude_none=True)]
            if params.devices:
                body["devices"] = [d.model_dump(exclude_none=True) for d in params.devices]
            if params.qosProfiles:
                body["qosProfiles"] = params.qosProfiles
            if params.defaultQosProfile:
                body["defaultQosProfile"] = params.defaultQosProfile
            if params.sink:
                body["sink"] = params.sink
            if params.sinkCredential:
                body["sinkCredential"] = params.sinkCredential.model_dump(exclude_none=True)

            try:
                access = await create_access_request(body)
            except ValueError as e:
                return f"Error: {e}"

            access_id = access.get("id", "?")
            partial = (
                "Some devices could not be added; they are listed below.\n\n"
                if access.get("results") else ""
            )
            return (
                f"# Device Access Created\n\n"
                f"Access request submitted. Each device moves from REQUESTED to GRANTED "
                f"once the CSP approves it.\n\n"
                f"{partial}"
                f"{fmt_access(access)}\n"
                f"**Access ID**: `{access_id}` — use this with `camara_delete_access` "
                f"to revoke access when no longer needed."
            )

        except Exception as e:
            return handle_error(e)

    # ── camara_delete_access ───────────────────────────────────────────────────

    @mcp.tool(
        name="camara_delete_access",
        annotations={
            "title": "Delete Device Access",
            "readOnlyHint": False,
            "destructiveHint": True,
            "idempotentHint": True,
            "openWorldHint": True,
        },
    )
    async def camara_delete_access(params: DeleteAccessInput) -> str:
        """Revoke a device access grant. This cannot be undone.

        Removes the device's permission to use the dedicated network.
        Delete all accesses before deleting the network itself.

        Args:
            params.accessId (str): UUID of the device access grant to delete.

        Returns:
            Confirmation message on success.

        Errors:
            404 — access not found; verify the accessId UUID.

        Use when:
            - "Revoke access c3d4e5f6-... from the network"
            - "Remove the device access I created earlier"
        """
        try:
            await api_request("accesses", f"/accesses/{params.accessId}", method="DELETE")
            return (
                f"Access `{params.accessId}` has been successfully deleted "
                f"(device access revoked)."
            )
        except Exception as e:
            return handle_error(e)

    # ── devices of an access ───────────────────────────────────────────────────

    @mcp.tool(
        name="camara_list_access_devices",
        annotations={
            "title": "List Devices of an Access",
            "readOnlyHint": True,
            "destructiveHint": False,
            "idempotentHint": True,
            "openWorldHint": True,
        },
    )
    async def camara_list_access_devices(params: ListAccessDevicesInput) -> str:
        """List the devices of an access, each with its own status (REQUESTED, GRANTED, DENIED).

        Args:
            params.accessId (str): UUID of the access.
            params.deviceStatus (optional): Only devices with this status.
            params.phoneNumber (optional str): Only the device with this phone number.
            params.page, params.perPage (optional): Read a single page. Omit page to get every device.

        Returns:
            The devices with their status and, for DENIED, the reason.

        Errors:
            404 — access not found, or an API that takes one device per access and has no
            device list.
        """
        try:
            devices: List[Dict[str, Any]] = await api_list(
                "accesses", f"/accesses/{params.accessId}/devices",
                params={"deviceStatus": params.deviceStatus} if params.deviceStatus else None,
                page=params.page, per_page=params.perPage, request=api_request,
                headers=x_device(params.phoneNumber),
            )
            if params.response_format == ResponseFormat.JSON:
                return json.dumps({"devices": devices, "count": len(devices)}, indent=2)
            if not devices:
                return "No devices in this access."
            return f"# Devices of access `{params.accessId}` ({len(devices)})\n\n" + "\n".join(
                fmt_access_device(d) for d in devices
            )
        except Exception as e:
            return _device_error(e)

    @mcp.tool(
        name="camara_add_devices_to_access",
        annotations={
            "title": "Add Devices to an Access",
            "readOnlyHint": False,
            "destructiveHint": False,
            "idempotentHint": False,
            "openWorldHint": True,
        },
    )
    async def camara_add_devices_to_access(params: AddDevicesInput) -> str:
        """Add several devices (1-100) to an existing access.

        If all are accepted the answer lists them (`recentAccessDevices`); if only some are, the answer
        lists the accepted ones and, separately, each failed device with its reason.

        Errors:
            409 / 422 — none of the devices could be added.
            404 — access not found, or an API that takes one device per access.
        """
        try:
            body = {"devices": [d.model_dump(exclude_none=True) for d in params.devices]}
            result: Dict[str, Any] = await api_request(
                "accesses", f"/accesses/{params.accessId}/devices/add", method="POST", body=body
            )
            return f"# Devices added to access `{params.accessId}`\n\n{fmt_access(result)}"
        except Exception as e:
            return _device_error(e)

    @mcp.tool(
        name="camara_remove_devices_from_access",
        annotations={
            "title": "Remove Devices from an Access",
            "readOnlyHint": False,
            "destructiveHint": True,
            "idempotentHint": True,
            "openWorldHint": True,
        },
    )
    async def camara_remove_devices_from_access(params: RemoveDevicesInput) -> str:
        """Remove several devices (1-100) from an access, each identified by a device object.

        If only some are removed, the answer lists each device that could not be removed with its reason.

        Errors:
            404 — access not found, or an API that takes one device per access.
        """
        try:
            result: Optional[Dict[str, Any]] = await api_request(
                "accesses", f"/accesses/{params.accessId}/devices/remove", method="POST",
                body={"devices": [d.model_dump(exclude_none=True) for d in params.devices]},
            )
            failed = (result or {}).get("results") or []
            if failed:
                return "Some devices could not be removed:\n\n" + fmt_access({"id": params.accessId, "results": failed})
            return f"Removed {len(params.devices)} device(s) from access `{params.accessId}`."
        except Exception as e:
            return _device_error(e)
