from flask import Flask, jsonify, request, send_from_directory
from flask_socketio import SocketIO, emit
from flask_cors import CORS
from backend.dispatcher import Dispatcher
from backend.benchmark import run_benchmark
from backend.city_graph import CityGraph
import time
import os
import threading
import random

# App Initialization
app = Flask(__name__, static_folder="../frontend", static_url_path="/")
CORS(app)
socketio = SocketIO(app, cors_allowed_origins="*")

# Global Dispatcher Instance (10 cabs)
dispatcher = Dispatcher(fleet_size=10)

# ── OS Concept: Mutex for Dispatch Critical Section ───────────────────────────
# Prevents double-booking: two simultaneous requests cannot both read the
# ready-queue and pick the same cab before either removes it.
# Mirrors OS kernel spinlock/mutex protecting the process scheduler.
dispatch_lock = threading.Lock()
# ─────────────────────────────────────────────────────────────────────────────

# Overriding logger to also emit websocket events
original_log = dispatcher.logger.log
def socketio_log(event_type, details):
    original_log(event_type, details)
    socketio.emit('log_entry', {
        'timestamp': time.time(),
        'event': event_type,
        'details': details
    })
dispatcher.logger.log = socketio_log

# Serve Frontend
@app.route("/")
def index():
    return app.send_static_file("index.html")

# REST API ENDPOINTS

@app.route("/api/graph", methods=["GET"])
def get_graph():
    graph = dispatcher.graph
    nodes_list = list(graph.nodes.values())
    edges_list = []
    for u, neighbors in graph.edges.items():
        for v in neighbors:
            if u < v: # Avoid duplicates
                edges_list.append([u, v])
    return jsonify({"nodes": nodes_list, "edges": edges_list})

@app.route("/api/cabs", methods=["GET"])
def get_cabs():
    return jsonify({"cabs": dispatcher.scheduler.process_table()})

@app.route("/api/logs", methods=["GET"])
def get_logs():
    return jsonify({"logs": dispatcher.logger.get_logs()})

@app.route("/api/surge", methods=["GET"])
def get_surge():
    total = len(dispatcher.scheduler.process_list)
    active = dispatcher.scheduler.get_active_count()
    mult = dispatcher.surge_engine.calculate_surge(total, active)
    return jsonify({"active": mult > 1.0, "multiplier": mult})

def _ride_destination(cab_pcb):
    """Resolve drop-off node from assigned ride, falling back to pickup/current."""
    ride = cab_pcb.assigned_ride
    if ride:
        return ride.get("destination_node", ride.get("passenger_node", cab_pcb.current_node))
    return cab_pcb.current_node


@app.route("/api/dispatch", methods=["POST"])
def dispatch_ride():
    data = request.get_json(silent=True) or {}
    passenger_node   = int(data.get("passenger_node", 0))
    destination_node = int(data.get("destination_node", passenger_node))
    method = data.get("method", "bfs")

    # ── Critical Section: acquire mutex before touching ready-queue ──────────
    # Only ONE dispatch runs at a time — like an OS kernel holding the
    # scheduler lock. Any concurrent request blocks here until released.
    if not dispatch_lock.acquire(timeout=5):
        return jsonify({"error": "Dispatch system busy — try again"}), 503

    try:
        old_surge = dispatcher.surge_engine.calculate_surge(
            len(dispatcher.scheduler.process_list),
            dispatcher.scheduler.get_active_count()
        )

        result = dispatcher.dispatch_ride(passenger_node, method)

        if "error" in result:
            return jsonify(result), 400

        pid = result["cab_pid"]
        cab_pcb = dispatcher.scheduler.process_list[pid]

        # Double-check: confirm cab entered DISPATCHED after assignment
        if cab_pcb.state.value != "DISPATCHED":
            return jsonify({"error": f"Cab {pid} already assigned — race condition prevented"}), 409

        # Store destination for the ride context
        if cab_pcb.assigned_ride:
            cab_pcb.assigned_ride["destination_node"] = destination_node
        # Note: We NO LONGER instantly move to EN_ROUTE here.
        # It takes 2 seconds to reach the passenger, done in the background thread.

    finally:
        dispatch_lock.release()  # Always release — even on exception
    # ── End Critical Section ─────────────────────────────────────────────────

    cab = cab_pcb.to_dict()
    cab["name"] = f"Cab-{pid:02d}"

    socketio.emit('dispatch_event', {
        'cab': cab, 'passenger_node': passenger_node,
        'destination_node': destination_node,
        'route': result["route"], 'method': method
    })
    socketio.emit('state_change', {
        'pid': pid, 'old_state': 'IDLE', 'new_state': 'DISPATCHED',
        'reason': f"Dispatched to node {passenger_node}",
        'timestamp': time.time()
    })

    new_surge = result["surge"]
    if new_surge != old_surge:
        socketio.emit('surge_update', {'active': new_surge > 1.0, 'multiplier': new_surge})

    # Auto-completion: 2 seconds to reach passenger, 3 seconds to reach destination (5s total)
    travel_secs = 5

    def _run_ride(pid, pass_node, dest_node):
        # ── Stage 1: Drive to passenger (2 seconds) ───────────────────────────
        time.sleep(2)
        with app.app_context():
            with dispatch_lock:
                pcb = dispatcher.scheduler.process_list.get(pid)
                if not pcb or pcb.state.value != "DISPATCHED":
                    return
                try:
                    dispatcher.scheduler.cab_arrived_at_passenger(pid)
                    pcb.current_node = pass_node
                    dispatcher.logger.log("STATE_TRANSITION",
                        f"Cab P{pid:02d}: DISPATCHED → EN_ROUTE (arrived at passenger node {pass_node})")
                except Exception as e:
                    dispatcher.logger.log("SYSTEM_ERROR", f"Arrival failed for P{pid}: {e}")
                    return

            socketio.emit('state_change', {
                'pid': pid, 'old_state': 'DISPATCHED', 'new_state': 'EN_ROUTE',
                'reason': f"Cab arrived at passenger node {pass_node}",
                'timestamp': time.time()
            })
            # Tell frontend to update the process table to reflect EN_ROUTE status
            socketio.emit('ride_completed', {  # We can reuse this event to trigger a table refresh
                'pid': pid, 'cab_name': f"Cab-{pid:02d}",
                'dest_node': pass_node,
                'process_table': dispatcher.scheduler.process_table()
            })

        # ── Stage 2: Drive to destination (3 seconds) ─────────────────────────
        time.sleep(3)
        with app.app_context():
            with dispatch_lock:
                pcb = dispatcher.scheduler.process_list.get(pid)
                if not pcb or pcb.state.value != "EN_ROUTE":
                    return  # Already completed manually
                try:
                    dispatcher.scheduler.complete_ride(pid, dest_node)
                    pcb.current_node = dest_node
                    dispatcher.logger.log("STATE_TRANSITION",
                        f"Cab P{pid:02d}: EN_ROUTE → COMPLETED → IDLE (auto, now at node {dest_node})")
                except Exception as e:
                    dispatcher.logger.log("SYSTEM_ERROR", f"Auto-complete failed for P{pid}: {e}")
                    return
            
            socketio.emit('state_change', {
                'pid': pid, 'old_state': 'EN_ROUTE', 'new_state': 'IDLE',
                'reason': f"Ride completed — cab now at node {dest_node}",
                'timestamp': time.time()
            })
            socketio.emit('ride_completed', {
                'pid': pid, 'cab_name': f"Cab-{pid:02d}",
                'dest_node': dest_node,
                'process_table': dispatcher.scheduler.process_table()
            })
            total  = len(dispatcher.scheduler.process_list)
            active = dispatcher.scheduler.get_active_count()
            surge  = dispatcher.surge_engine.calculate_surge(total, active)
            socketio.emit('surge_update', {'active': surge > 1.0, 'multiplier': surge})

    t = threading.Thread(target=_run_ride, args=(pid, passenger_node, destination_node), daemon=True)
    t.start()


    result["process_table"] = dispatcher.scheduler.process_table()
    result["cab"] = cab
    result["method"] = method
    result["destination_node"] = destination_node
    result["auto_complete_secs"] = travel_secs
    result["surge"] = {"active": new_surge > 1.0, "multiplier": new_surge}
    return jsonify(result)

@app.route("/api/complete", methods=["POST"])
def complete_ride():
    data = request.get_json(silent=True) or {}

    if not dispatch_lock.acquire(timeout=5):
        return jsonify({"error": "Dispatch system busy — try again"}), 503

    try:
        # Complete ALL active rides at once (sent by "Complete All" button)
        if data.get("all"):
            completed = 0
            for pid, cab_pcb in dispatcher.scheduler.process_list.items():
                if cab_pcb.state.value in ("EN_ROUTE", "DISPATCHED"):
                    dest_node = _ride_destination(cab_pcb)
                    if cab_pcb.state.value == "DISPATCHED":
                        dispatcher.scheduler.cab_arrived_at_passenger(pid)
                    dispatcher.scheduler.complete_ride(pid, dest_node)
                    socketio.emit('state_change', {
                        'pid': pid, 'old_state': 'EN_ROUTE', 'new_state': 'IDLE',
                        'reason': "Ride completed", 'timestamp': time.time()
                    })
                    completed += 1
            total = len(dispatcher.scheduler.process_list)
            active = dispatcher.scheduler.get_active_count()
            new_surge = dispatcher.surge_engine.calculate_surge(total, active)
            socketio.emit('surge_update', {'active': new_surge > 1.0, 'multiplier': new_surge})
            return jsonify({
                "completed": completed,
                "process_table": dispatcher.scheduler.process_table(),
                "surge": {"active": new_surge > 1.0, "multiplier": new_surge}
            })

        # Complete single cab by pid
        pid = int(data.get("cab_pid", -1))
        if pid == -1:
            return jsonify({"error": "cab_pid required"}), 400

        cab_pcb = dispatcher.scheduler.process_list.get(pid)
        if not cab_pcb:
            return jsonify({"error": f"Cab {pid} not found"}), 404

        if cab_pcb.state.value not in ("EN_ROUTE", "DISPATCHED"):
            return jsonify({"error": "Cab is not on a ride"}), 400

        dest_node = _ride_destination(cab_pcb)
        if cab_pcb.state.value == "DISPATCHED":
            dispatcher.scheduler.cab_arrived_at_passenger(pid)
        dispatcher.scheduler.complete_ride(pid, dest_node)

        socketio.emit('state_change', {
            'pid': pid, 'old_state': 'EN_ROUTE', 'new_state': 'IDLE',
            'reason': "Ride completed", 'timestamp': time.time()
        })
        total = len(dispatcher.scheduler.process_list)
        active = dispatcher.scheduler.get_active_count()
        new_surge = dispatcher.surge_engine.calculate_surge(total, active)
        socketio.emit('surge_update', {'active': new_surge > 1.0, 'multiplier': new_surge})

        return jsonify({"success": True, "cab": cab_pcb.to_dict()})
    finally:
        dispatch_lock.release()

@app.route("/api/benchmark", methods=["POST"])
def run_benchmark_api():
    import time
    from collections import deque
    import random
    
    results = []
    test_cases = [(25, 10), (100, 50), (500, 200)]
    for nodes, cabs in test_cases:
        graph = {i: [] for i in range(nodes)}
        for i in range(nodes):
            if i > 0: graph[i].append(i-1)
            if i < nodes-1: graph[i].append(i+1)
            graph[i].append(random.randint(0, nodes-1))
            
        ready_cabs = set(random.sample(range(nodes), cabs))
        passenger = random.randint(0, nodes-1)
        
        start_bfs = time.perf_counter()
        queue = deque([(passenger, [passenger])])
        visited = {passenger}
        while queue:
            curr, path = queue.popleft()
            if curr in ready_cabs: break
            for n in graph[curr]:
                if n not in visited:
                    visited.add(n)
                    queue.append((n, path + [n]))
        bfs_ms = (time.perf_counter() - start_bfs) * 1000
        
        start_bf = time.perf_counter()
        min_path = float('inf')
        for cab in ready_cabs:
            q = deque([(cab, [cab])])
            v = {cab}
            while q:
                curr, path = q.popleft()
                if curr == passenger:
                    if len(path) < min_path: min_path = len(path)
                    break
                for n in graph[curr]:
                    if n not in v:
                        v.add(n)
                        q.append((n, path + [n]))
        bf_ms = (time.perf_counter() - start_bf) * 1000
        speedup = bf_ms / bfs_ms if bfs_ms > 0 else 0
        results.append({
            "nodes": nodes, "cabs": cabs, "bfs_ms": round(bfs_ms, 4), 
            "brute_ms": round(bf_ms, 4), "speedup": round(speedup, 2)
        })
        
    return jsonify({"results": results})

if __name__ == '__main__':
    socketio.run(app, debug=True, port=5000)
