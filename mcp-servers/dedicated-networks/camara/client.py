"""
camara/client.py
────────────────
Shared HTTP client and error handler used by every tool.

Exported:
  api_request(api, path, method, body, params)   →  parsed JSON (dict / list / None)
  api_list(api, path, ...)                       →  every item of a paged list, as one list
  api_post_dropping(api, path, body, optional)   →  POST that retries without an unaccepted optional property
  handle_error(exception)                         →  human-readable error string
"""

import re
from typing import Any, Dict, List, Optional, Tuple

import httpx

from camara.config import ACCESS_TOKEN, API_ROOT, API_PATHS


# ─── HTTP headers ──────────────────────────────────────────────────────────────

def _build_headers() -> Dict[str, str]:
    """Return request headers for every CAMARA API call.

    Always includes Content-Type and Accept for JSON.
    Adds Authorization: Bearer <token> only when a token is configured.
    """
    headers = {
        "Content-Type": "application/json",
        "Accept": "application/json",
    }
    if ACCESS_TOKEN:
        headers["Authorization"] = f"Bearer {ACCESS_TOKEN}"
    return headers


# ─── Generic HTTP request ──────────────────────────────────────────────────────

async def api_request(
    api: str,                                    # key in API_PATHS, e.g. "networks"
    path: str,                                   # e.g. "/networks" or "/networks/{id}"
    method: str = "GET",
    body: Optional[Dict[str, Any]] = None,       # JSON request body (POST)
    params: Optional[Dict[str, Any]] = None,     # URL query parameters (GET)
) -> Any:
    """Send an HTTP request to a CAMARA sub-API and return the parsed JSON body.

    Builds the full URL from API_ROOT + the sub-API path + the endpoint path.
    Strips out any query parameters whose value is None.
    Raises httpx.HTTPStatusError on 4xx / 5xx so handle_error() can format them.
    Returns None for 204 No Content (used by DELETE operations).
    """
    url = f"{API_ROOT}{API_PATHS[api]}{path}"

    # Drop query params that were not provided (value is None)
    clean_params = {k: v for k, v in (params or {}).items() if v is not None}

    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.request(
            method=method,
            url=url,
            headers=_build_headers(),
            json=body,
            params=clean_params or None,
        )
        response.raise_for_status()

        if response.status_code == 204:   # DELETE returns no body
            return None
        return response.json()


# ─── Paged lists ───────────────────────────────────────────────────────────────

async def api_list(
    api: str,
    path: str,
    params: Optional[Dict[str, Any]] = None,
    method: str = "GET",
    body: Optional[Dict[str, Any]] = None,
    per_page: Optional[int] = None,
    max_pages: int = 50,
    page: Optional[int] = None,
    request: Optional[Any] = None,
) -> List[Dict[str, Any]]:
    """Return every item of a list endpoint as one list.

    The Dedicated Networks APIs answer with a page, {"items": [...], "pagination": {...}}, where
    pagination holds page, perPage, totalCount and totalPages; a page is asked for with the page and
    perPage query parameters. This follows totalPages. An API that still answers with a bare array is
    read as one single page and not asked again, since it ignores page and perPage.

    With `page` given, only that one page is read; `per_page` alone sets the size of each page asked for. `request` replaces api_request (tests).
    """
    fetch = request or api_request
    size = per_page or 100
    single = page is not None
    items: List[Dict[str, Any]] = []
    for number in ([page or 1] if single else range(1, max_pages + 1)):
        query = dict(params or {})
        query["page"] = number
        query["perPage"] = size
        data = await fetch(api, path, method=method, body=body, params=query)
        if isinstance(data, list):
            return items + data
        page_items = (data or {}).get("items") or []
        items.extend(page_items)
        total_pages = ((data or {}).get("pagination") or {}).get("totalPages")
        if single or not total_pages or number >= int(total_pages) or not page_items:
            break
    return items


# ─── POST that tolerates an optional property the API does not accept ──────────

async def api_post_dropping(
    api: str,
    path: str,
    body: Dict[str, Any],
    optional: Tuple[str, ...] = (),
) -> Tuple[Any, List[str]]:
    """POST `body`. If the API answers 400 or 422 and names one of the `optional` properties as not
    recognised, send the request again without it.

    Returns (response, dropped property names). Keeps one request body, the one the specification
    defines, for deployments that do not accept every property yet. Any other error is raised.
    """
    try:
        return await api_request(api, path, method="POST", body=body), []
    except httpx.HTTPStatusError as e:
        if e.response.status_code not in (400, 422):
            raise
        message = e.response.text
        unknown = [
            p for p in optional
            if p in body and re.search(
                rf"['\"`]{p}['\"`][^.]*(unrecogni[sz]ed|unknown|not allowed|additional)"
                rf"|(unrecogni[sz]ed|unknown|not allowed|additional)[^.]*['\"`]{p}['\"`]",
                message, re.IGNORECASE,
            )
        ]
        if not unknown:
            raise
        reduced = {k: v for k, v in body.items() if k not in unknown}
        return await api_request(api, path, method="POST", body=reduced), unknown


# ─── Error handler ─────────────────────────────────────────────────────────────

def handle_error(e: Exception) -> str:
    """Convert any exception into a clear, actionable error message.

    Returns a plain string so tool functions can return it directly to Claude
    instead of crashing.
    """
    if isinstance(e, httpx.HTTPStatusError):
        status = e.response.status_code

        # Try to extract the CAMARA error body (has "code" and "message" fields)
        try:
            body = e.response.json()
            detail = body.get("message") or body.get("code") or ""
            suffix = f" — {detail}" if detail else ""
        except Exception:
            suffix = ""

        messages: Dict[int, str] = {
            400: f"Error 400 Bad Request{suffix}. Check all required fields are correct.",
            401: f"Error 401 Unauthorized{suffix}. Set a valid token via CAMARA_ACCESS_TOKEN.",
            403: f"Error 403 Forbidden{suffix}. Your token lacks the required scope.",
            404: f"Error 404 Not Found{suffix}. Verify the ID is correct.",
            409: f"Error 409 Conflict{suffix}. Resource may already exist or be in an incompatible state.",
            410: f"Error 410 Gone{suffix}. The resource no longer exists.",
            422: f"Error 422 Unprocessable Content{suffix}. Check device identifier rules.",
        }
        return messages.get(status, f"Error {status}{suffix}. API request failed.")

    if isinstance(e, httpx.ConnectError):
        return (
            f"Error: Cannot connect to {API_ROOT}. "
            "Check that CAMARA_API_ROOT is correct and the server is running."
        )
    if isinstance(e, httpx.TimeoutException):
        return "Error: Request timed out. Check that CAMARA_API_ROOT is reachable."

    return f"Error: {type(e).__name__}: {e}"
