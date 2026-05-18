from backend.city_graph import CityGraph
from backend.scheduler import CabScheduler
from backend.event_logger import EventLogger
from backend.surge_pricing import SurgePricingEngine
import time

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
            self.logger.log("SYSTEM_ERROR", "Unreachable passenger")
            return {"error": "Unreachable passenger"}
            
        pid = self.scheduler.get_pid_at_node(nearest_node)
        
        # Calculate Surge based on OS Scheduler state
        total_cabs = len(self.scheduler.process_list)
        active_cabs = self.scheduler.get_active_count()
        surge_mult = self.surge_engine.calculate_surge(total_cabs, active_cabs)
        
        if surge_mult > 1.0:
            self.logger.log("SURGE_TRIGGERED", f"Surge multiplier {surge_mult}x applied ({active_cabs}/{total_cabs} active)")
            
        ride_details = {
            "passenger_node": passenger_node,
            "route": path,
            "method": method,
            "surge_multiplier": surge_mult
        }
        
        self.scheduler.dispatch_cab(pid, passenger_node, ride_details)
        
        self.logger.log("CAB_DISPATCHED", f"Cab P{pid:02d} dispatched using {method.upper()}. Time: {elapsed_ms:.4f}ms. Hops: {len(path)-1}")
        
        # Exploring alternatives using DFS for demonstration
        alternatives = self.graph.dfs_explore_routes(nearest_node, passenger_node, max_depth=len(path)+2)
        
        return {
            "cab_pid": pid,
            "route": path,
            "hops": len(path) - 1,
            "time_ms": elapsed_ms,
            "alternatives": len(alternatives),
            "surge": surge_mult
        }
