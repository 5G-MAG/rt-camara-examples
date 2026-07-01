#!/usr/bin/env python3
"""
CAMARA Dedicated Networks — MCP Server (Python)
================================================
Entry point.  Creates the FastMCP instance, registers all tool groups,
and starts the server.

The four API groups:
  1. dedicated-network            → Networks (create / list / get / delete)
  2. dedicated-network-profiles   → Profiles (list / get)        [read-only]
  3. dedicated-network-accesses   → Device Accesses (create / list / get / delete)
  4. dedicated-network-areas      → Service Areas (retrieve / get) [read-only]

Configuration (environment variables):
  CAMARA_API_ROOT      Base URL of your CAMARA server   (default: http://localhost:9091)
  CAMARA_ACCESS_TOKEN  Bearer token for authentication  (default: empty → no auth header)

Run (stdio transport for Claude Desktop):
  python server.py

For full setup instructions see README.md.
"""

from mcp.server.fastmcp import FastMCP

from camara.tools.networks  import register_network_tools
from camara.tools.profiles  import register_profile_tools
from camara.tools.accesses  import register_access_tools
from camara.tools.areas     import register_area_tools
from camara.prompts         import register_prompts

# ── Create the MCP server instance ────────────────────────────────────────────
mcp = FastMCP("CAMARA Dedicated Networks")

# ── Register all tool groups ───────────────────────────────────────────────────
register_network_tools(mcp)
register_profile_tools(mcp)
register_access_tools(mcp)
register_area_tools(mcp)

# ── Register workflow guidance prompts ────────────────────────────────────────
register_prompts(mcp)

# ── Start the server ───────────────────────────────────────────────────────────
if __name__ == "__main__":
    mcp.run()
