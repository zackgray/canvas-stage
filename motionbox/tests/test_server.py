"""End-to-end over HTTP against the real service process shape (in a thread): auth on every call,
health states, 422/409, make -> poll -> files, cancel. Fake mode, CPU only."""
import http.client
import json
import threading

import pytest

from motionbox import server

from conftest import needs_spike, wait_for


@pytest.fixture()
def svc(cfg, spike):
    service = server.Service(cfg)
    httpd = server.ThreadingHTTPServer((cfg.host, 0), server.make_handler(service))
    thread = threading.Thread(target=httpd.serve_forever, daemon=True)
    thread.start()
    yield cfg, service, httpd
    httpd.shutdown()


def call(httpd, method, path, body=None, token="test-token"):
    conn = http.client.HTTPConnection(httpd.server_address[0], httpd.server_address[1], timeout=10)
    headers = {"Authorization": f"Bearer {token}"} if token else {}
    payload = json.dumps(body) if body is not None else None
    conn.request(method, path, payload, headers)
    res = conn.getresponse()
    data = res.read()
    ctype = res.getheader("Content-Type", "")
    conn.close()
    return res.status, json.loads(data) if "json" in ctype else data


@needs_spike
class TestAuth:
    def test_every_call_needs_the_token(self, svc):
        cfg, service, httpd = svc
        assert call(httpd, "GET", "/health", token=None)[0] == 401
        assert call(httpd, "GET", "/health", token="wrong")[0] == 401
        assert call(httpd, "POST", "/jobs/abc/cancel", token=None)[0] == 401
        assert call(httpd, "GET", "/health")[0] == 200


@needs_spike
class TestHealth:
    def test_ready_and_fields(self, svc):
        cfg, service, httpd = svc
        st, body = call(httpd, "GET", "/health")
        assert st == 200
        assert body["state"] == "ready"
        assert body["encoder"] == "cpu"
        assert body["gpu"]["name"]
        assert body["version"]
        assert "fake" in body["encoder_source"]


@needs_spike
class TestJobsOverHttp:
    def test_bad_spec_422(self, svc, spec):
        cfg, service, httpd = svc
        st, body = call(httpd, "POST", "/jobs", {"spec": {"sentence": ""}})
        assert st == 422 and body["error"] == "bad spec" and body["message"]
        bad = dict(spec); bad["seconds"] = 30
        assert call(httpd, "POST", "/jobs", {"spec": bad})[0] == 422
        assert call(httpd, "POST", "/jobs", {"n": 8})[0] == 422

    def test_busy_409(self, svc, spec):
        cfg, service, httpd = svc
        service.runner.gen = _slow(cfg, 0.3)
        j1 = service.runner.submit(spec, n=8)
        service.runner.submit(spec, n=1)          # queued
        st, body = call(httpd, "POST", "/jobs", {"spec": spec})
        assert st == 409 and body["error"] == "busy"
        service.runner.cancel(j1.id)

    def test_make_poll_and_files(self, svc, spec):
        cfg, service, httpd = svc
        st, body = call(httpd, "POST", "/jobs", {"spec": spec, "n": 4})
        assert st == 201 and body["id"]
        job_id = body["id"]
        assert wait_for(lambda: call(httpd, "GET", f"/jobs/{job_id}")[1]["stage"] == "done", timeout=120)
        st, status = call(httpd, "GET", f"/jobs/{job_id}")
        assert st == 200
        assert status["done"] == 4 and status["round"] == 1
        assert 1 <= len(status["tries"]) <= 3
        assert status["dropped"]["count"] == 0
        for t in status["tries"]:
            for ext in (".bvh", ".png"):
                st, data = call(httpd, "GET", f"/jobs/{job_id}/files/{t['id']}{ext}")
                assert st == 200 and len(data) > 100
            st, meta = call(httpd, "GET", f"/jobs/{job_id}/files/{t['id']}.json")
            assert st == 200 and meta["rank"] == t["rank"] and meta["scores"] and meta["seed"] == t["seed"]
        assert call(httpd, "GET", f"/jobs/{job_id}/files/nope.bvh")[0] == 404
        assert call(httpd, "GET", "/jobs/unknown")[0] == 404

    def test_cancel_endpoint(self, svc, spec):
        cfg, service, httpd = svc
        service.runner.gen = _slow(cfg, 0.3)
        j1 = service.runner.submit(spec, n=8)
        assert wait_for(lambda: service.runner.status(j1.id)["done"] >= 1, timeout=60)
        st, body = call(httpd, "POST", f"/jobs/{j1.id}/cancel")
        assert st == 200
        assert wait_for(lambda: call(httpd, "GET", f"/jobs/{j1.id}")[1]["stage"] == "cancelled", timeout=60)
        assert call(httpd, "POST", "/jobs/unknown/cancel")[0] == 404


def _slow(cfg, delay):
    from motionbox.fake_generator import FakeGenerator
    import time

    class Slow(FakeGenerator):
        def generate(self, **kw):
            time.sleep(delay)
            return super().generate(**kw)

    return Slow(cfg)
