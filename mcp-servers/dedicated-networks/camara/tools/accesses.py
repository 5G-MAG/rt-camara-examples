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
  POST   /accesses/{id}/devices                     → camara_add_device_to_access
  POST   /accesses/{id}/devices/add                 → camara_add_devices_to_access
  POST   /accesses/{id}/devices/remove              → camara_remove_devices_from_access
  GET    /accesses/{id}/devices/{accessDeviceId}    → camara_get_access_device
  DELETE /accesses/{id}/devices/{accessDeviceId}    → camara_delete_access_device

An access holds a list of devices. A deployment that still takes one device per access (and has no
/devices endpoints) is served too: create_access then sends the single `device` form.

Call register_access_tools(mcp) once from server.py to activate all the tools.
"""

import json
import re
from typing import Any, Dict, List, Optional, Tuple

import httpx
from mcp.server.mcpserver import MCPServer as FastMCP

from camara.client import api_list, api_post_dropping, api_request, handle_error
from camara.formatters import fmt_access, fmt_access_device
from camara.models import (
    AddDeviceInput,
    AddDevicesInput,
    CreateAccessInput,
    DeleteAccessDeviceInput,
    DeleteAccessInput,
    GetAccessDeviceInput,
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


async def create_access_request(body: Dict[str, Any]) -> Tuple[Dict[str, Any], List[str]]:
    """POST /accesses with `devices`, as the specification defines it.

    An API that answers that it wants a single `device` is sent the earlier form instead, for exactly
    one device. `name` is dropped if the API does not accept it. Returns (access, dropped properties).
    """
    spec = dict(body)
    if "device" in spec and "devices" not in spec:
        spec["devices"] = [spec.pop("device")]
    try:
        return await api_post_dropping("accesses", "/accesses", spec, ("name",))
    except httpx.HTTPStatusError as e:
        if "devices" not in spec or not _wants_single_device(e):
            raise
        if len(spec["devices"]) != 1:
            raise ValueError(
                "This API deployment takes one device per access. Create one access for each device."
            ) from e
        earlier = {k: v for k, v in spec.items() if k != "devices"}
        earlier["device"] = spec["devices"][0]
        return await api_post_dropping("accesses", "/accesses", earlier, ("name",))


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
            params.accessDeviceId (optional str): Only accesses that contain this device.
            params.name (optional str): Filter by exact access name.
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
            if params.accessDeviceId:
                query_params["accessDeviceId"] = params.accessDeviceId
            if params.name:
                query_params["name"] = params.name

            accesses: List[Dict[str, Any]] = await api_list(
                "accesses", "/accesses", params=query_params,
                page=params.page, per_page=params.perPage, request=api_request,
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
        `device`. The answer lists the devices added (`addedAccessDevices`), with `stats`;
        if only some could be added, the failed ones are listed with the reason.

        With a two-legged access token: you MUST provide the device field to
        identify which device gets access.

        With a three-legged access token: the device is derived automatically
        from the token — do NOT provide the device field.

        Optionally restrict which QoS profiles the device may use by supplying
        qosProfiles (a subset of what the network allows). Omit to allow all.

        Args:
            params.networkId (str): UUID of the dedicated network.
            params.name (optional str): A human-readable name for the access.
            params.device (optional): One device (phone number, IPv4, or IPv6).
                Required with two-legged token; omit with three-legged token.
            params.devices (optional list): Several devices to add (1-100).
            params.qosProfiles (optional list[str]): Allowed QoS profiles for this device.
            params.defaultQosProfile (optional str): Default QoS profile for this device.
            params.sink (optional str): HTTPS notification callback URL.
            params.sinkCredential (optional): Credentials for the callback.

        Returns:
            Created access with: id (store as accessId), networkId, stats, the devices
            added (each with its own status, starting at REQUESTED), qosProfiles.

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

            if params.name:
                body["name"] = params.name
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
                access, dropped = await create_access_request(body)
            except ValueError as e:
                return f"Error: {e}"

            access_id = access.get("id", "?")
            note = (
                f"The API does not accept an access name yet, so `{params.name}` was not stored.\n\n"
                if dropped else ""
            )
            partial = (
                "Some devices could not be added; they are listed below.\n\n"
                if access.get("results") else ""
            )
            return (
                f"# Device Access Created\n\n"
                f"Access request submitted. Each device moves from REQUESTED to GRANTED "
                f"once the CSP approves it.\n\n"
                f"{note}{partial}"
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
            params.addedAtOrAfter / addedAfter / addedAtOrBefore / addedBefore (optional):
                Only devices added in this time range (RFC 3339 with timezone).
            params.page, params.perPage (optional): Read a single page. Omit to get every device.

        Returns:
            The devices with their access device id (use it to remove a device), status and
            the time they were added.

        Errors:
            404 — access not found, or an API that takes one device per access and has no
            device list.
        """
        try:
            query: Dict[str, Any] = {
                "deviceStatus": params.deviceStatus,
                "addedAt.gte": params.addedAtOrAfter,
                "addedAt.gt": params.addedAfter,
                "addedAt.lte": params.addedAtOrBefore,
                "addedAt.lt": params.addedBefore,
            }
            devices: List[Dict[str, Any]] = await api_list(
                "accesses", f"/accesses/{params.accessId}/devices",
                params={k: v for k, v in query.items() if v is not None},
                page=params.page, per_page=params.perPage, request=api_request,
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
        name="camara_add_device_to_access",
        annotations={
            "title": "Add One Device to an Access",
            "readOnlyHint": False,
            "destructiveHint": False,
            "idempotentHint": False,
            "openWorldHint": True,
        },
    )
    async def camara_add_device_to_access(params: AddDeviceInput) -> str:
        """Add one device to an existing access.

        With a two-legged token the `device` MUST be given; with a three-legged token it MUST
        be omitted. For several devices use camara_add_devices_to_access.

        Errors:
            409 — the device is already in the access.
            422 — device identifier missing or not valid.
            404 — access not found, or an API that takes one device per access.
        """
        try:
            body: Dict[str, Any] = {}
            if params.device:
                body["device"] = params.device.model_dump(exclude_none=True)
            added: Dict[str, Any] = await api_request(
                "accesses", f"/accesses/{params.accessId}/devices", method="POST", body=body
            )
            return f"# Device added\n\n{fmt_access_device(added)}"
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

        If all are added the answer lists them; if only some are added, the answer lists the added
        ones and, separately, each failed device with its reason.

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
        """Remove several devices from an access, by their access device ids.

        Get the ids from camara_list_access_devices. If only some are removed, the answer lists
        each device that could not be removed with its reason.

        Errors:
            404 — access not found, or an API that takes one device per access.
        """
        try:
            result: Optional[Dict[str, Any]] = await api_request(
                "accesses", f"/accesses/{params.accessId}/devices/remove", method="POST",
                body={"accessDeviceIds": params.accessDeviceIds},
            )
            failed = (result or {}).get("results") or []
            if failed:
                return "Some devices could not be removed:\n\n" + fmt_access({"id": params.accessId, "results": failed})
            return f"Removed {len(params.accessDeviceIds)} device(s) from access `{params.accessId}`."
        except Exception as e:
            return _device_error(e)

    @mcp.tool(
        name="camara_get_access_device",
        annotations={
            "title": "Get a Device of an Access",
            "readOnlyHint": True,
            "destructiveHint": False,
            "idempotentHint": True,
            "openWorldHint": True,
        },
    )
    async def camara_get_access_device(params: GetAccessDeviceInput) -> str:
        """Get one device of an access: its status, the reason for it, and when it was added.

        Errors:
            404 — access or access device not found.
        """
        try:
            device: Dict[str, Any] = await api_request(
                "accesses", f"/accesses/{params.accessId}/devices/{params.accessDeviceId}"
            )
            if params.response_format == ResponseFormat.JSON:
                return json.dumps(device, indent=2)
            return f"# Access device\n\n{fmt_access_device(device)}"
        except Exception as e:
            return _device_error(e)

    @mcp.tool(
        name="camara_delete_access_device",
        annotations={
            "title": "Remove a Device from an Access",
            "readOnlyHint": False,
            "destructiveHint": True,
            "idempotentHint": True,
            "openWorldHint": True,
        },
    )
    async def camara_delete_access_device(params: DeleteAccessDeviceInput) -> str:
        """Remove one device from an access. This cannot be undone.

        Errors:
            404 — access or access device not found.
        """
        try:
            await api_request(
                "accesses", f"/accesses/{params.accessId}/devices/{params.accessDeviceId}",
                method="DELETE",
            )
            return f"Device `{params.accessDeviceId}` removed from access `{params.accessId}`."
        except Exception as e:
            return _device_error(e)
