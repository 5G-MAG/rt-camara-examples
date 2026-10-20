"""
tests/test_config.py
────────────────────
CAMARA_API_ROOT is the address of the server, written with or without a trailing slash; the URLs built from it
must be the same either way.
"""

import importlib

import pytest

import camara.config as config


@pytest.fixture(autouse=True)
def restore_config(monkeypatch):
    yield
    monkeypatch.delenv("CAMARA_API_ROOT", raising=False)
    importlib.reload(config)


@pytest.mark.parametrize("root", ["https://api.example.com", "https://api.example.com/", "https://api.example.com//"])
def test_the_api_root_ends_in_exactly_one_slash(monkeypatch, root):
    monkeypatch.setenv("CAMARA_API_ROOT", root)
    importlib.reload(config)
    assert config.API_ROOT == "https://api.example.com/"
    url = f"{config.API_ROOT}{config.API_PATHS['profiles']}/profiles"
    assert url == "https://api.example.com/dedicated-network-profiles/v0.2-wip/profiles"


def test_the_default_root_is_the_local_server(monkeypatch):
    monkeypatch.delenv("CAMARA_API_ROOT", raising=False)
    importlib.reload(config)
    assert config.API_ROOT == "http://localhost:9091/"
