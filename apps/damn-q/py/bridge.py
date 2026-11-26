"""Browser-side bridge for the DAMN-Q workbench.

Mirrors the JSON routes in damn_q/server.py (/api/manifest, /api/examples,
/api/validate, /api/run) so the same workbench UI can run entirely inside
the browser via Pyodide, with no local Python server.

Files are written to FS_ROOT by bridge.js before this module is imported.
"""

import json
import os
import sys
from urllib.parse import unquote

FS_ROOT = "/home/pyodide/dq"
EXAMPLES_DIR = os.path.join(FS_ROOT, "experiments")
MAX_BODY_BYTES = 5 * 1024 * 1024

if FS_ROOT not in sys.path:
    sys.path.insert(0, FS_ROOT)

from damn_q.manifest import COMPONENT_MANIFEST, MANIFEST_VERSION  # noqa: E402
from damn_q.runner import SIMULATOR_VERSION, load_experiment, run_experiment  # noqa: E402
from damn_q.schema import (  # noqa: E402
    ExperimentValidationError,
    SCHEMA_VERSION,
    validate_experiment,
)


def _list_examples():
    if not os.path.isdir(EXAMPLES_DIR):
        return []
    items = []
    for name in sorted(os.listdir(EXAMPLES_DIR)):
        if not name.endswith(".json"):
            continue
        try:
            doc = load_experiment(os.path.join(EXAMPLES_DIR, name))
        except (OSError, json.JSONDecodeError):
            continue
        items.append(
            {
                "filename": name,
                "name": doc.get("name", name[:-5]),
                "description": doc.get("description", ""),
            }
        )
    return items


def _response(status, payload):
    return json.dumps({"status": status, "body": payload})


def handle(method, path, body_text):
    """Handle one API call. Returns a JSON string: {"status": int, "body": {...}}."""
    method = method.upper()

    if method == "GET":
        if path == "/api/manifest":
            return _response(
                200,
                {
                    "schema_version": SCHEMA_VERSION,
                    "manifest_version": MANIFEST_VERSION,
                    "simulator_version": SIMULATOR_VERSION,
                    "components": COMPONENT_MANIFEST,
                },
            )

        if path == "/api/examples":
            return _response(200, {"examples": _list_examples()})

        if path.startswith("/api/examples/"):
            filename = unquote(path[len("/api/examples/"):])
            if "/" in filename or "\\" in filename or not filename.endswith(".json"):
                return _response(400, {"ok": False, "error": "Invalid example filename."})
            candidate = os.path.join(EXAMPLES_DIR, filename)
            if not os.path.isfile(candidate):
                return _response(404, {"ok": False, "error": f"Example {filename!r} not found."})
            try:
                return _response(200, load_experiment(candidate))
            except (OSError, json.JSONDecodeError) as exc:
                return _response(500, {"ok": False, "error": str(exc)})

    if method == "POST" and path in ("/api/validate", "/api/run"):
        if len(body_text.encode("utf-8")) > MAX_BODY_BYTES:
            msg = f"Request body size out of range (max {MAX_BODY_BYTES} bytes)."
            return _response(400, {"ok": False, "errors": [msg], "error": msg})
        try:
            doc = json.loads(body_text)
        except json.JSONDecodeError as exc:
            msg = f"Invalid JSON payload: {exc}"
            return _response(400, {"ok": False, "errors": [msg], "error": msg})

        if path == "/api/validate":
            try:
                validate_experiment(doc)
            except ExperimentValidationError as exc:
                return _response(400, {"ok": False, "errors": exc.errors, "error": str(exc)})
            return _response(200, {"ok": True, "schema_version": SCHEMA_VERSION})

        try:
            result = run_experiment(doc)
        except ExperimentValidationError as exc:
            return _response(400, {"ok": False, "errors": exc.errors, "error": str(exc)})
        except ValueError as exc:
            return _response(400, {"ok": False, "errors": [str(exc)], "error": str(exc)})
        return _response(200, {"ok": True, "result": result})

    return _response(404, {"ok": False, "error": f"Unknown route: {path}"})
