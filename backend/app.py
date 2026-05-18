from flask import Flask, jsonify, request, send_from_directory
from flask_socketio import SocketIO, emit
from flask_cors import CORS
from backend.dispatcher import Dispatcher
from backend.benchmark import run_benchmark
from backend.city_graph import CityGraph
import time
import os

# App Initialization
app = Flask(__name__, static_folder="../frontend", static_url_path="/")
CORS(app)
socketio = SocketIO(app, cors_allowed_origins="*")

# Global Dispatcher Instance (10 cabs)
dispatcher = Dispatcher(fleet_size=10)

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

@app.route("/api/dispatch", methods=["POST"])
def dispatch_ride():
    data = request.json
    passenger_node = int(data.get("passenger_node", 0))
    method = data.get("method", "bfs")
    
    # Store old state for surge comparison
    old_surge = dispatcher.surge_engine.calculate_surge(
        len(dispatcher.scheduler.process_list), 
        dispatcher.scheduler.get_active_count()
    )
    
    result = dispatcher.dispatch_ride(passenger_node, method)
    
    if "error" in result:
        return jsonify(result), 400
        
    pid = result["cab_pid"]
    cab = dispatcher.scheduler.process_list[pid].to_dict()
    
    # Emit events
    socketio.emit('dispatch_event', {
        'cab': cab,
        'passenger_node': passenger_node,
        'route': result["route"],
        'method': method
    })
    
    socketio.emit('state_change', {
        'pid': pid,
        'old_state': 'IDLE',
        'new_state': 'DISPATCHED',
        'reason': f"Assigned to passenger at node {passenger_node}",
        'timestamp': time.time()
    })
    
    new_surge = result["surge"]
    if new_surge != old_surge:
        socketio.emit('surge_update', {
            'active': new_surge > 1.0,
            'multiplier': new_surge
        })
        
    result["process_table"] = dispatcher.scheduler.process_table()
    result["cab"] = cab
    return jsonify(result)

@app.route("/api/complete", methods=["POST"])
def complete_ride():
    data = request.json
    pid = int(data.get("cab_pid"))
    cab_pcb = dispatcher.scheduler.process_list[pid]
    
    if cab_pcb.state.value != "EN_ROUTE" and cab_pcb.state.value != "DISPATCHED":
        return jsonify({"error": "Cab is not on a ride"}), 400
        
    dest_node = cab_pcb.assigned_ride["passenger_node"] if cab_pcb.assigned_ride else cab_pcb.current_node
    
    # Simulate EN_ROUTE transition if it wasn't done yet, then complete
    if cab_pcb.state.value == "DISPATCHED":
        dispatcher.scheduler.cab_arrived_at_passenger(pid)
        
    dispatcher.scheduler.complete_ride(pid, dest_node) 
    
    socketio.emit('state_change', {
        'pid': pid,
        'old_state': 'EN_ROUTE',
        'new_state': 'IDLE',
        'reason': "Ride completed",
        'timestamp': time.time()
    })
    
    total = len(dispatcher.scheduler.process_list)
    active = dispatcher.scheduler.get_active_count()
    new_surge = dispatcher.surge_engine.calculate_surge(total, active)
    socketio.emit('surge_update', {
        'active': new_surge > 1.0,
        'multiplier': new_surge
    })
    
    return jsonify({"success": True, "cab": cab_pcb.to_dict()})

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
