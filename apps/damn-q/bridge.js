/*
 * DAMN-Q in-browser bridge (Pyodide).
 *
 * The workbench UI (app.js) talks to /api/* endpoints. On a static host such
 * as GitHub Pages there is no Python server, so this script:
 *   1. loads Pyodide (Python compiled to WebAssembly) and NumPy,
 *   2. copies the DAMN-Q simulator sources and example experiments into the
 *      in-browser filesystem, and
 *   3. replaces window.fetch for /api/ URLs so they are answered by py/bridge.py.
 * app.js needs no changes.
 */
(function () {
  const PYODIDE_VERSION = "0.26.4";
  const PYODIDE_INDEX = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`;
  const FS_ROOT = "/home/pyodide/dq";

  const overlay = document.getElementById("runtime-overlay");
  const overlayText = document.getElementById("runtime-overlay-text");
  const setStatus = (msg, isError = false) => {
    if (!overlay) return;
    overlayText.textContent = msg;
    overlay.classList.toggle("error", isError);
  };

  const realFetch = window.fetch.bind(window);
  let pyHandle = null;

  const readyPromise = (async () => {
    setStatus("Loading Python runtime (Pyodide)...");
    await new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = `${PYODIDE_INDEX}pyodide.js`;
      s.onload = resolve;
      s.onerror = () => reject(new Error("Could not load Pyodide from CDN."));
      document.head.appendChild(s);
    });

    const pyodide = await loadPyodide({ indexURL: PYODIDE_INDEX });

    setStatus("Installing NumPy...");
    await pyodide.loadPackage("numpy");

    setStatus("Loading DAMN-Q simulator...");
    const manifest = await (await realFetch("py/files.json")).json();
    pyodide.FS.mkdirTree(FS_ROOT);
    for (const rel of manifest.py) {
      const text = await (await realFetch(`py/${rel}`)).text();
      const dest = `${FS_ROOT}/${rel}`;
      const dir = dest.slice(0, dest.lastIndexOf("/"));
      pyodide.FS.mkdirTree(dir);
      pyodide.FS.writeFile(dest, text);
    }
    pyodide.FS.mkdirTree(`${FS_ROOT}/experiments`);
    for (const name of manifest.experiments) {
      const text = await (await realFetch(`experiments/${name}`)).text();
      pyodide.FS.writeFile(`${FS_ROOT}/experiments/${name}`, text);
    }

    pyodide.runPython(`import sys\nif '${FS_ROOT}' not in sys.path: sys.path.insert(0, '${FS_ROOT}')`);
    const bridge = pyodide.pyimport("bridge");
    pyHandle = bridge.handle;

    if (overlay) overlay.hidden = true;
    return true;
  })().catch((err) => {
    setStatus(`Failed to start the simulator: ${err.message}`, true);
    throw err;
  });

  // Prevent unhandled-rejection noise; the overlay already shows the error.
  readyPromise.catch(() => {});

  window.fetch = async function (input, init = {}) {
    const rawUrl = typeof input === "string" ? input : input.url;
    const url = new URL(rawUrl, window.location.href);
    const idx = url.pathname.indexOf("/api/");
    if (idx === -1) return realFetch(input, init);

    await readyPromise;
    const method = (init.method || "GET").toUpperCase();
    const body = typeof init.body === "string" ? init.body : "";
    const { status, body: payload } = JSON.parse(pyHandle(method, url.pathname.slice(idx), body));
    return new Response(JSON.stringify(payload), {
      status,
      headers: { "Content-Type": "application/json; charset=utf-8" },
    });
  };
})();
