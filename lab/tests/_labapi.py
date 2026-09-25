"""Shared setup for the lab-api tests: import the package from lab/labapi and
skip cleanly when its dependencies are not installed (run through
`just test-labapi`, which uses the uv environment)."""

import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
LABAPI = ROOT / "lab" / "labapi"
sys.path.insert(0, str(LABAPI))

try:
    import fastapi  # noqa: F401
    import httpx  # noqa: F401
    import yaml  # noqa: F401
    from fastapi.testclient import TestClient  # noqa: F401

    HAVE_DEPS = True
    WHY = ""
except ImportError as e:  # pragma: no cover
    HAVE_DEPS = False
    WHY = f"lab-api dependencies not importable ({e}); run `just test-labapi`"

needs_deps = unittest.skipUnless(HAVE_DEPS, WHY)
SMOKE = ROOT / "lab" / "scenarios" / "smoke-two-players.yaml"
