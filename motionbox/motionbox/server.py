"""The always-on HTTP service (loopback only, contract in docs/motion-box-contract.md).

    python -m motionbox.server [--fake] [--port N] [--config cfg.json]

Every call needs `Authorization: Bearer <MOTION_BOX_TOKEN>`. One GPU job at a time, a queue of 1.
Boot: the generator loads and runs a throwaway warm-up generation; /health reports `warming`
until that finishes, then `ready` (or `busy` while a job runs). Answers come from stdlib
http.server only; the service never touches the network beyond its loopback socket.
"""
import argparse
import hmac
import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from . import __version__, config as config_mod, jobs
from .fake_generator import ENCODER_SOURCE as FAKE_SOURCE, FakeGenerator
from .generator import ENCODER_SOURCE


class Service:
    def __init__(self, cfg):
        self.cfg = cfg
        gen = FakeGenerator(cfg) if cfg.fake else _real_generator(cfg)
        self.gen = gen
        self.runner = jobs.Runner(cfg, gen)
        self.state = "warming"
        self.boot_error = None
        try:
            gen.load()
            gen.warm()
            self.state = "ready"
        except Exception as e:  # reported through /health; the service stays up to say so
            self.boot_error = f"{type(e).__name__}: {e}"
            self.state = "failed"

    def health(self) -> dict:
        if self.state == "ready" and self.runner.busy():
            state = "busy"
        else:
            state = self.state
        out = {"state": state, "gpu": self.gen.health(), "encoder": "cpu",
               "encoder_source": FAKE_SOURCE if self.cfg.fake else ENCODER_SOURCE, "version": __version__}
        if getattr(self.gen, "seconds_per_try", None):
            out["secondsPerTry"] = round(self.gen.seconds_per_try, 2)
        if self.boot_error:
            out["message"] = self.boot_error
        return out


def _real_generator(cfg):
    from .generator import KimodoGenerator
    return KimodoGenerator(cfg)


def validate_spec(body: dict):
    """Return (spec, n, seeds) or raise ValueError with a plain message (422)."""
    spec = body.get("spec")
    if not isinstance(spec, dict):
        raise ValueError("a move spec is required")
    sentence = spec.get("sentence")
    if not isinstance(sentence, str) or not sentence.strip():
        raise ValueError("the spec needs a sentence")
    seconds = spec.get("seconds")
    if not isinstance(seconds, (int, float)) or not (2.0 <= seconds <= 10.0):
        raise ValueError("seconds must be between 2 and 10")
    keys = spec.get("keys", [])
    if not isinstance(keys, list):
        raise ValueError("keys must be a list")
    for k in keys:
        if not isinstance(k, dict) or not isinstance(k.get("frame"), int):
            raise ValueError("each key needs a frame")
        hands = k.get("hands")
        if not isinstance(hands, dict):
            raise ValueError("each key needs hands")
        for side in ("Left", "Right"):
            v = hands.get(side)
            if not isinstance(v, list) or len(v) != 3 or not all(isinstance(x, (int, float)) for x in v):
                raise ValueError(f"key hands.{side} must be three numbers")
        if "pose" in k and k["pose"] not in ("reach-low", "hold-chest", "hold-high", "stand") and not k.get("base"):
            raise ValueError(f"unknown base pose {k['pose']!r}")
    for t in ("grab", "release"):
        if t in spec and not isinstance(spec[t], (int, float)):
            raise ValueError(f"{t} must be a number")
    hold = spec.get("hold")        # the app sends the held window [from, to]; a bare number is accepted too
    if hold is not None and not (isinstance(hold, (int, float)) or (isinstance(hold, list) and len(hold) == 2 and all(isinstance(x, (int, float)) for x in hold))):
        raise ValueError("hold must be a number or a [from, to] window")
    n = body.get("n", 8)
    if not isinstance(n, int) or not (1 <= n <= 8):
        raise ValueError("n must be between 1 and 8")
    seeds = body.get("seeds")
    if seeds is not None and (not isinstance(seeds, list) or not all(isinstance(s, int) for s in seeds)):
        raise ValueError("seeds must be a list of integers")
    return spec, n, seeds


def make_handler(svc: Service):
    class Handler(BaseHTTPRequestHandler):
        protocol_version = "HTTP/1.1"

        def log_message(self, *a):
            pass

        def _send(self, code: int, obj: dict):
            body = json.dumps(obj).encode()
            self.send_response(code)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def _authed(self) -> bool:
            want = svc.cfg.token or ""
            got = self.headers.get("Authorization", "")
            ok = got.startswith("Bearer ") and hmac.compare_digest(got[7:], want)
            if not ok:
                self._send(401, {"error": "unauthorized"})
            return ok

        def do_GET(self):
            if not self._authed():
                return
            parts = self.path.split("?")[0].strip("/").split("/")
            if parts == ["health"]:
                self._send(200, svc.health())
            elif len(parts) == 2 and parts[0] == "jobs":
                try:
                    self._send(200, svc.runner.status(parts[1]))
                except KeyError:
                    self._send(404, {"error": "no such job"})
            elif len(parts) == 4 and parts[0] == "jobs" and parts[2] == "files":
                self._file(parts[1], parts[3])
            else:
                self._send(404, {"error": "not found"})

        def _file(self, job_id, name):
            if not name.endswith((".bvh", ".png", ".json")) or "/" in name or ".." in name:
                self._send(404, {"error": "not found"})
                return
            p = svc.runner.jobs_dir / job_id / name
            if not p.is_file():
                self._send(404, {"error": "not found"})
                return
            data = p.read_bytes()
            kind = {"bvh": "application/octet-stream", "png": "image/png", "json": "application/json"}[name.rsplit(".", 1)[1]]
            self.send_response(200)
            self.send_header("Content-Type", kind)
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)

        def do_POST(self):
            if not self._authed():
                return
            length = int(self.headers.get("Content-Length", 0))
            parts = self.path.strip("/").split("/")
            if parts == ["jobs"]:
                try:
                    body = json.loads(self.rfile.read(length) or b"{}")
                    spec, n, seeds = validate_spec(body)
                except (ValueError, json.JSONDecodeError) as e:
                    self._send(422, {"error": "bad spec", "message": str(e)})
                    return
                if svc.state != "ready":
                    self._send(503, {"error": "not ready", "message": svc.boot_error or svc.state})
                    return
                try:
                    job = svc.runner.submit(spec, n, seeds)
                except jobs.Busy:
                    self._send(409, {"error": "busy"})
                    return
                self._send(201, {"id": job.id})
            elif len(parts) == 3 and parts[0] == "jobs" and parts[2] == "cancel":
                try:
                    stage = svc.runner.cancel(parts[1])
                    self._send(200, {"stage": stage})
                except KeyError:
                    self._send(404, {"error": "no such job"})
            else:
                self._send(404, {"error": "not found"})

    return Handler


def main(argv=None):
    ap = argparse.ArgumentParser(description="motion box service (loopback only)")
    ap.add_argument("--fake", action="store_true", help="no GPU/model: serve stored spike outputs")
    ap.add_argument("--port", type=int, default=None)
    ap.add_argument("--config", default=None)
    a = ap.parse_args(argv)
    cfg = config_mod.load(a.config, port=a.port, fake=True if a.fake else None)
    svc = Service(cfg)
    server = ThreadingHTTPServer((cfg.host, cfg.port), make_handler(svc))
    print(f"motion box {__version__} on http://{cfg.host}:{cfg.port} ({'fake' if cfg.fake else 'real'} mode, state {svc.state})", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
