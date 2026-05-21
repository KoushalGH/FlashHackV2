"""Concurrency tests for dispatch mutex (double-booking prevention)."""
import threading
import time
from concurrent.futures import ThreadPoolExecutor

import pytest

from backend.app import app, dispatch_lock, dispatcher


@pytest.fixture
def client():
    return app.test_client()


def _fleet_invariant():
    """IDLE cabs must match ready_queue; non-IDLE must not be in ready_queue."""
    rq = set(dispatcher.scheduler.ready_queue)
    for pid, cab in dispatcher.scheduler.process_list.items():
        st = cab.state.value
        in_rq = pid in rq
        if st == "IDLE":
            assert in_rq, f"PID {pid} IDLE but not in ready_queue"
        else:
            assert not in_rq, f"PID {pid} {st} but still in ready_queue"


def test_concurrent_dispatch_no_double_booking(client):
    client.post("/api/complete", json={"all": True})

    def dispatch():
        return client.post(
            "/api/dispatch",
            json={"passenger_node": 12, "destination_node": 12, "method": "bfs"},
        )

    with ThreadPoolExecutor(max_workers=15) as pool:
        responses = list(pool.map(lambda _: dispatch(), range(15)))

    ok = [r for r in responses if r.status_code == 200]
    pids = [r.get_json()["cab_pid"] for r in ok]

    assert len(pids) == len(set(pids)), "same cab assigned to multiple bookings"
    assert len(ok) == 10
    assert sum(1 for r in responses if r.status_code == 400) == 5
    _fleet_invariant()


def test_lock_timeout_returns_503(client):
    assert dispatch_lock.acquire(timeout=0.1)
    try:
        r = client.post(
            "/api/dispatch",
            json={"passenger_node": 0, "method": "bfs"},
        )
        assert r.status_code == 503
        assert "busy" in r.get_json()["error"].lower()
    finally:
        dispatch_lock.release()


def test_complete_and_dispatch_under_lock(client):
    client.post("/api/complete", json={"all": True})

    def dispatch(i):
        return client.post(
            "/api/dispatch",
            json={"passenger_node": i % 25, "method": "bfs"},
        )

    def complete():
        return client.post("/api/complete", json={"all": True})

    with ThreadPoolExecutor(max_workers=30) as pool:
        futs = [pool.submit(dispatch, i) for i in range(20)]
        futs += [pool.submit(complete) for _ in range(10)]
        for f in futs:
            f.result()

    _fleet_invariant()
