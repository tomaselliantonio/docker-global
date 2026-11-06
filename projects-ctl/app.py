"""Accende/spegne interi progetti docker compose (tutti i loro container). Solo stdlib.

Agisce SOLO sui progetti elencati in PROJECTS (slug -> nome del progetto compose),
riconosciuti dall'etichetta com.docker.compose.project. Nessun altro container viene toccato.
"""
import http.client
import http.server
import json
import os
import socket
import threading
import time
import urllib.parse

PROJECTS = json.loads(os.environ["PROJECTS"])
ORIGINS = {o.strip() for o in os.environ.get("ALLOWED_ORIGINS", "http://homepage.localhost").split(",") if o.strip()}
STOP_TIMEOUT = int(os.environ.get("STOP_TIMEOUT", "20"))
START_ORDER = ["db", "php", "nginx", "mailpit", "pma"]  # spegnimento: ordine inverso
START_GIVEUP = 180  # secondi, poi smetto di aspettare i container "pronti"

ops = {}      # slug -> "starting" | "stopping"
op_t0 = {}    # slug -> istante di inizio operazione
lock = threading.Lock()


class DockerConn(http.client.HTTPConnection):
    def __init__(self):
        super().__init__("localhost")

    def connect(self):
        s = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        s.settimeout(120)
        s.connect("/var/run/docker.sock")
        self.sock = s


def docker(method, path):
    c = DockerConn()
    try:
        c.request(method, path)
        r = c.getresponse()
        body = r.read()
        return r.status, (json.loads(body) if body and body[:1] in b"{[" else None)
    finally:
        c.close()


def containers(project):
    f = urllib.parse.quote(json.dumps({"label": [f"com.docker.compose.project={project}"]}))
    code, data = docker("GET", f"/containers/json?all=1&filters={f}")
    return data if code == 200 and data else []


def service_of(c):
    return c.get("Labels", {}).get("com.docker.compose.service", "")


def order_key(c):
    s = service_of(c)
    return START_ORDER.index(s) if s in START_ORDER else len(START_ORDER)


def is_ready(c):
    st = c.get("Status", "")
    return c.get("State") == "running" and "health: starting" not in st and "unhealthy" not in st


def status(slug):
    cs = containers(PROJECTS[slug])
    total = len(cs)
    if total == 0:
        return {"state": "missing", "progress": 0, "stage": "Progetto non trovato", "seconds": 0}
    running = sum(1 for c in cs if c.get("State") == "running")
    ready = sum(1 for c in cs if is_ready(c))
    with lock:
        op = ops.get(slug)
        secs = int(time.time() - op_t0[slug]) if op else 0
        if op == "stopping" and running == 0:
            ops.pop(slug, None)
            op = None
        elif op == "starting" and (ready == total or secs > START_GIVEUP):
            ops.pop(slug, None)
            op = None
    if op == "stopping":
        done = total - running
        return {"state": "stopping", "progress": int(done / total * 100), "stage": f"Spegnimento {done}/{total}", "seconds": secs}
    if op == "starting":
        return {"state": "starting", "progress": max(5, int(ready / total * 100)), "stage": f"{ready}/{total} container pronti", "seconds": secs}
    if running == 0:
        return {"state": "stopped", "progress": 0, "stage": "Spento", "seconds": 0}
    if ready == total:
        return {"state": "running", "progress": 100, "stage": f"{total}/{total} attivi", "seconds": 0}
    return {"state": "partial", "progress": int(ready / total * 100), "stage": f"{running}/{total} attivi", "seconds": 0}


def begin(slug, op):
    with lock:
        if ops.get(slug):
            return False
        ops[slug] = op
        op_t0[slug] = time.time()
    return True


def start(slug):
    if not begin(slug, "starting"):
        return

    def run():
        try:
            for c in sorted(containers(PROJECTS[slug]), key=order_key):
                if c.get("State") != "running":
                    docker("POST", f"/containers/{c['Id']}/start")
                    if service_of(c) == "db":
                        time.sleep(3)  # il database prima del resto
        except Exception:
            pass

    threading.Thread(target=run, daemon=True).start()


def stop(slug):
    if not begin(slug, "stopping"):
        return

    def run():
        try:
            for c in sorted(containers(PROJECTS[slug]), key=order_key, reverse=True):
                if c.get("State") == "running":
                    docker("POST", f"/containers/{c['Id']}/stop?t={STOP_TIMEOUT}")
        except Exception:
            pass

    threading.Thread(target=run, daemon=True).start()


class Handler(http.server.BaseHTTPRequestHandler):
    server_version = "projects-ctl"

    def log_message(self, *a):
        pass

    def _cors(self):
        origin = self.headers.get("Origin", "")
        if origin in ORIGINS:
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")

    def _send(self, code, obj):
        body = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self._cors()
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "X-Kali-Ctl")
        self.end_headers()

    def do_GET(self):
        if self.path.split("?")[0] == "/api/projects":
            try:
                self._send(200, {slug: status(slug) for slug in PROJECTS})
            except Exception as e:
                self._send(500, {"error": str(e)})
        else:
            self._send(404, {"error": "not found"})

    def do_POST(self):
        # l'header custom blocca i POST "semplici" fatti da altre pagine (CSRF)
        if self.headers.get("X-Kali-Ctl") != "1":
            return self._send(403, {"error": "forbidden"})
        parts = self.path.split("?")[0].strip("/").split("/")  # api/projects/<slug>/<azione>
        if len(parts) != 4 or parts[:2] != ["api", "projects"] or parts[2] not in PROJECTS or parts[3] not in ("start", "stop"):
            return self._send(404, {"error": "not found"})
        slug = parts[2]
        try:
            (start if parts[3] == "start" else stop)(slug)
            self._send(202, status(slug))
        except Exception as e:
            self._send(500, {"error": str(e)})


if __name__ == "__main__":
    http.server.ThreadingHTTPServer(("0.0.0.0", 8000), Handler).serve_forever()
