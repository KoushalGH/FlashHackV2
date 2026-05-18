from backend.city_graph import CityGraph
from backend.scheduler import CabScheduler
from backend.event_logger import EventLogger
from backend.surge_pricing import SurgePricingEngine
import time

# OS State mapping — each cab is a process, states mirror OS process lifecycle
OS_STATE_MAP = {
    "REGISTERED": "New",
    "IDLE":        "Ready",
    "DISPATCHED":  "Running",
    "EN_ROUTE":    "Waiting",
    "COMPLETED":   "Terminated",
}

class Dispatcher:
    def __init__(self, fleet_size: int = 10):
        self.graph = CityGraph()
        self.scheduler = CabScheduler(fleet_size)
        self.logger = EventLogger()
        self.surge_engine = SurgePricingEngine()

    def dispatch_ride(self, passenger_node: int, method: str = "bfs"):
        self.logger.log("RIDE_REQUEST", f"Passenger requested ride at node {passenger_node}")

        ready_nodes = self.scheduler.get_ready_cabs_nodes()
        if not ready_nodes:
            self.logger.log("SYSTEM_ERROR", "No cabs available in ready queue")
            return {"error": "No cabs available"}

        start_time = time.perf_counter()

        if method == "bfs":
            nearest_node, path = self.graph.bfs_nearest_cab(passenger_node, ready_nodes)
        else:
            nearest_node, path = self.graph.brute_force_nearest(passenger_node, ready_nodes)

        elapsed_ms = (time.perf_counter() - start_time) * 1000

        if nearest_node is None:
            self.logger.log("SYSTEM_ERROR", "Unreachable passenger — no path exists")
            return {"error": "Unreachable passenger"}

        pid = self.scheduler.get_pid_at_node(nearest_node)

        # Surge pricing — calculated from OS process table state
        total_cabs  = len(self.scheduler.process_list)
        active_cabs = self.scheduler.get_active_count()
        surge_mult  = self.surge_engine.calculate_surge(total_cabs, active_cabs)

        if surge_mult > 1.0:
            self.logger.log("SURGE_TRIGGERED",
                f"Surge {surge_mult}x — {active_cabs}/{total_cabs} cabs active (>{int(active_cabs/total_cabs*100)}% utilization)")

        ride_details = {
            "passenger_node": passenger_node,
            "route": path,
            "method": method,
            "surge_multiplier": surge_mult
        }

        self.scheduler.dispatch_cab(pid, passenger_node, ride_details)

        hops = len(path) - 1
        self.logger.log("CAB_DISPATCHED",
            f"Cab P{pid:02d} dispatched using {method.upper()}. Time: {elapsed_ms:.4f}ms. Hops: {hops}")

        # ── DFS: Explore alternative pickup routes from cab to passenger ──────
        # DFS runs AFTER BFS dispatch — shows all possible routes, not just shortest.
        # This demonstrates why BFS (single shortest path) is preferred for dispatch
        # while DFS gives full route visibility for planning/audit purposes.
        alternatives = self.graph.dfs_explore_routes(nearest_node, passenger_node, max_depth=hops + 3)

        if alternatives:
            self.logger.log("DFS_ROUTES",
                f"DFS found {len(alternatives)} alternative route(s) from node {nearest_node} to node {passenger_node}. "
                f"Lengths: {sorted(set(len(r) - 1 for r in alternatives))} hops")
        else:
            self.logger.log("DFS_ROUTES",
                f"DFS found 0 alternative routes (cab is already at pickup node)")
        # ──────────────────────────────────────────────────────────────────────

        # ── OS Process Table Snapshot ─────────────────────────────────────────
        # Print full process table after every dispatch event (spec requirement).
        # Each cab's OS state is mapped to canonical OS terminology.
        table = self.scheduler.process_table()
        idle_count       = sum(1 for c in table if c["state"] == "IDLE")
        dispatched_count = sum(1 for c in table if c["state"] == "DISPATCHED")
        enroute_count    = sum(1 for c in table if c["state"] == "EN_ROUTE")
        self.logger.log("PROCESS_TABLE",
            f"Fleet snapshot — Ready(IDLE): {idle_count} | "
            f"Running(DISPATCHED): {dispatched_count} | "
            f"Waiting(EN_ROUTE): {enroute_count} | "
            f"Total: {total_cabs}")
        # ──────────────────────────────────────────────────────────────────────

        return {
            "cab_pid":      pid,
            "route":        path,
            "hops":         hops,
            "time_ms":      elapsed_ms,
            "alternatives": len(alternatives),
            "alt_routes":   [r for r in alternatives[:3]],  # top 3 DFS routes for display
            "surge":        surge_mult,
            "process_snapshot": {
                "idle": idle_count,
                "dispatched": dispatched_count,
                "en_route": enroute_count,
                "total": total_cabs
            }
        }

