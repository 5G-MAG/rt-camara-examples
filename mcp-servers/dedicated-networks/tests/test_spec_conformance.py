"""
tests/test_spec_conformance.py
──────────────────────────────
The Dedicated Networks APIs as release r2.2 (version 0.2.0-rc.1) of the specification defines them: paged
lists, a network name, and an access that holds a list of devices. Each case runs against a fake CAMARA API that answers either in the
form the specification defines or in the earlier form of the sandbox (bare arrays, no name, one device per
access, no /devices endpoints). The fake replaces httpx's transport; nothing leaves the machine.
"""

import asyncio
import json

import httpx
import pytest

from camara import client
from camara.models import (
    AddDevicesInput,
    CreateAccessInput,
    CreateNetworkInput,
    ListAccessDevicesInput,
    ListAccessesInput,
    ListNetworksInput,
    RemoveDevicesInput,
)
from camara.tools import accesses as accesses_module
from camara.tools import networks as networks_module

PHONE = "+41795550001"


class FakeApi:
    """Records requests; answers in `mode` 'spec' or 'legacy'."""

    def __init__(self, mode):
        self.mode = mode
        self.calls = []
        self.headers = []

    def handler(self, request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content) if request.content else None
        path = request.url.path
        query = dict(request.url.params)
        self.calls.append((request.method, path, query, body))
        self.headers.append(dict(request.headers))
        spec = self.mode == "spec"

        if request.method == "GET" and path.endswith("/networks"):
            all_items = [{"id": f"n{i}", "status": "ACTIVATED"} for i in range(1, 6)]
            if not spec:
                return httpx.Response(200, json=all_items)
            page, per_page = int(query["page"]), int(query["perPage"])
            return httpx.Response(200, json={
                "items": all_items[(page - 1) * per_page: page * per_page],
                "pagination": {"page": page, "perPage": per_page, "totalCount": 5, "totalPages": -(-5 // per_page)},
            })

        if request.method == "POST" and path.endswith("/networks"):
            if not spec and "name" in body:
                return httpx.Response(400, json={"status": 400, "code": "INVALID_ARGUMENT", "message": "Property 'name' is unrecognized"})
            return httpx.Response(201, json={**body, "id": "n1", "status": "REQUESTED"})

        if request.method == "POST" and path.endswith("/accesses"):
            if not spec:
                if "device" not in body:
                    return httpx.Response(400, json={"status": 400, "code": "INVALID_ARGUMENT", "message": "Required property 'device' is missing"})
                return httpx.Response(201, json={**body, "id": "a1", "status": "REQUESTED"})
            added = [
                {"device": d, "status": "REQUESTED"}
                for d in body.get("devices", [])
                if d.get("phoneNumber") != "+41795550999"
            ]
            failed = [
                {"device": d, "status": 422, "code": "UNPROCESSABLE_CONTENT", "message": "not supported"}
                for d in body.get("devices", []) if d.get("phoneNumber") == "+41795550999"
            ]
            out = {"id": "a1", "networkId": body["networkId"],
                   "stats": {"totalDevices": len(added), "totalGranted": 0, "totalDenied": 0},
                   "recentAccessDevices": added}
            if failed:
                out["results"] = failed
                return httpx.Response(207, json=out)
            return httpx.Response(201, json=out)

        if request.method == "POST" and path.endswith("/devices/remove"):
            return httpx.Response(204)

        if request.method == "POST" and path.endswith("/devices/add"):
            return httpx.Response(201, json={"recentAccessDevices": [{"device": body["devices"][0], "status": "REQUESTED"}]})

        if "/devices" in path:
            if not spec:
                return httpx.Response(404, json="No matching api service")
            return httpx.Response(200, json={
                "items": [{"device": {"phoneNumber": PHONE}, "status": "GRANTED"}],
                "pagination": {"page": 1, "perPage": 100, "totalCount": 1, "totalPages": 1},
            })
        return httpx.Response(404, json={"message": "unexpected " + path})


@pytest.fixture
def fake(monkeypatch):
    real = httpx.AsyncClient   # taken once, so a second install() does not wrap the first

    def install(mode):
        api = FakeApi(mode)
        transport = httpx.MockTransport(api.handler)
        monkeypatch.setattr(client.httpx, "AsyncClient", lambda **kw: real(transport=transport, **kw))
        return api
    return install


def run(coro):
    return asyncio.run(coro)


def _tools(register, module):
    """Collect the plain tool functions a register_* call defines."""
    found = {}

    class Collector:
        def tool(self, name, **_):
            def deco(fn):
                found[name] = fn
                return fn
            return deco

    register(Collector())
    return found


ACCESS_TOOLS = _tools(accesses_module.register_access_tools, accesses_module)
NETWORK_TOOLS = _tools(networks_module.register_network_tools, networks_module)


def test_list_follows_every_page(fake):
    api = fake("spec")
    out = run(client.api_list("networks", "/networks", per_page=2))
    assert [n["id"] for n in out] == ["n1", "n2", "n3", "n4", "n5"]
    assert [c[2]["page"] for c in api.calls] == ["1", "2", "3"]


def test_list_reads_a_bare_array_once(fake):
    api = fake("legacy")
    out = run(client.api_list("networks", "/networks", per_page=2))
    assert len(out) == 5
    assert len(api.calls) == 1


def test_list_with_page_reads_one_page(fake):
    api = fake("spec")
    out = run(client.api_list("networks", "/networks", page=2, per_page=2))
    assert [n["id"] for n in out] == ["n3", "n4"]
    assert len(api.calls) == 1


def test_list_networks_tool_passes_name_and_paging(fake):
    api = fake("spec")
    run(NETWORK_TOOLS["camara_list_networks"](ListNetworksInput(name="Final", page=1, perPage=3)))
    assert api.calls[0][2]["name"] == "Final"
    assert api.calls[0][2]["perPage"] == "3"


def test_network_name_is_sent_and_dropped_only_when_refused(fake):
    params = dict(serviceAreaId="a", serviceTime={"start": "2026-10-27T10:00:00Z", "end": "2026-10-27T11:00:00Z"},
                  networkProfileId="p", name="Final")
    api = fake("spec")
    out = run(NETWORK_TOOLS["camara_create_network"](CreateNetworkInput(**params)))
    assert api.calls[0][3]["name"] == "Final"
    assert "was not stored" not in out

    api = fake("legacy")
    out = run(NETWORK_TOOLS["camara_create_network"](CreateNetworkInput(**params)))
    assert [("name" in c[3]) for c in api.calls] == [True, False]
    assert "was not stored" in out


def test_other_400_is_not_retried(fake):
    api = fake("legacy")
    with pytest.raises(httpx.HTTPStatusError):
        run(client.api_post_dropping("accesses", "/accesses", {"networkId": "n"}, ("name",)))
    assert len(api.calls) == 1


def test_there_is_no_access_name_in_this_release():
    assert "name" not in CreateAccessInput.model_fields
    assert "name" not in ListAccessesInput.model_fields


def test_create_access_sends_a_devices_list(fake):
    api = fake("spec")
    out = run(ACCESS_TOOLS["camara_create_access"](CreateAccessInput(
        networkId="n1", devices=[{"phoneNumber": PHONE}, {"phoneNumber": "+41795550002"}])))
    sent = api.calls[0][3]
    assert [d["phoneNumber"] for d in sent["devices"]] == [PHONE, "+41795550002"]
    assert "2 in total" in out
    assert PHONE in out


def test_create_access_with_one_device_still_sends_a_list(fake):
    api = fake("spec")
    run(ACCESS_TOOLS["camara_create_access"](CreateAccessInput(networkId="n1", device={"phoneNumber": PHONE})))
    assert api.calls[0][3]["devices"] == [{"phoneNumber": PHONE}]
    assert "device" not in api.calls[0][3]


def test_create_access_reports_devices_that_failed(fake):
    fake("spec")
    out = run(ACCESS_TOOLS["camara_create_access"](CreateAccessInput(
        networkId="n1", devices=[{"phoneNumber": PHONE}, {"phoneNumber": "+41795550999"}])))
    assert "could not be added" in out
    assert "UNPROCESSABLE_CONTENT" in out


def test_create_access_falls_back_to_the_single_device_form(fake):
    api = fake("legacy")
    out = run(ACCESS_TOOLS["camara_create_access"](CreateAccessInput(networkId="n1", device={"phoneNumber": PHONE})))
    assert len(api.calls) == 2                       # the specification's form, then the earlier form
    last = api.calls[-1][3]
    assert last["device"] == {"phoneNumber": PHONE}
    assert "devices" not in last
    assert "REQUESTED" in out


def test_create_access_with_several_devices_on_the_earlier_form_says_so(fake):
    fake("legacy")
    out = run(ACCESS_TOOLS["camara_create_access"](CreateAccessInput(
        networkId="n1", devices=[{"phoneNumber": PHONE}, {"phoneNumber": "+41795550002"}])))
    assert out.startswith("Error: This API deployment takes one device per access")


def test_device_and_devices_together_are_refused(fake):
    fake("spec")
    out = run(ACCESS_TOOLS["camara_create_access"](CreateAccessInput(
        networkId="n1", device={"phoneNumber": PHONE}, devices=[{"phoneNumber": PHONE}])))
    assert out.startswith("Error")


def test_list_accesses_passes_the_network_filter_and_the_x_device_header(fake):
    api = fake("spec")
    run(ACCESS_TOOLS["camara_list_accesses"](ListAccessesInput(networkId="n1", phoneNumber=PHONE)))
    assert api.calls[0][2]["networkId"] == "n1"
    assert api.headers[0]["x-device"] == f'phonenumber="{PHONE}"'


def test_list_access_devices_filters_and_formats(fake):
    api = fake("spec")
    out = run(ACCESS_TOOLS["camara_list_access_devices"](ListAccessDevicesInput(
        accessId="a1", deviceStatus="GRANTED", phoneNumber=PHONE)))
    assert api.calls[0][2]["deviceStatus"] == "GRANTED"
    assert api.headers[0]["x-device"] == f'phonenumber="{PHONE}"'
    assert "GRANTED" in out and PHONE in out


def test_add_and_remove_devices(fake):
    api = fake("spec")
    out = run(ACCESS_TOOLS["camara_add_devices_to_access"](AddDevicesInput(accessId="a1", devices=[{"phoneNumber": PHONE}])))
    assert api.calls[0][1].endswith("/accesses/a1/devices/add")
    assert PHONE in out
    out = run(ACCESS_TOOLS["camara_remove_devices_from_access"](RemoveDevicesInput(accessId="a1", devices=[{"phoneNumber": PHONE}])))
    assert api.calls[1][3] == {"devices": [{"phoneNumber": PHONE}]}
    assert "Removed 1 device" in out


def test_device_endpoints_on_the_earlier_form_say_not_found(fake):
    fake("legacy")
    out = run(ACCESS_TOOLS["camara_list_access_devices"](ListAccessDevicesInput(accessId="a1")))
    assert "404" in out
    assert "one device per access" in out


def test_the_tools_are_those_of_this_release():
    assert set(ACCESS_TOOLS) == {
        "camara_list_accesses", "camara_get_access", "camara_create_access", "camara_delete_access",
        "camara_list_access_devices", "camara_add_devices_to_access", "camara_remove_devices_from_access",
    }
