from city_graph import CityGraph
from cab_process import CabPCB, CabState, InvalidStateTransition

def run_tests():
    print("--- Testing Cab State Machine ---")
    cab = CabPCB(pid=1, start_node=0)
    print(f"Created Cab 1, state: {cab.state}")
    
    cab.transition(CabState.IDLE, "Ready for work")
    print(f"Transitioned to IDLE, state: {cab.state}")
    
    cab.transition(CabState.DISPATCHED, "Assigned to passenger")
    print(f"Transitioned to DISPATCHED, state: {cab.state}")
    
    try:
        # Should raise error since DISPATCHED can only go to EN_ROUTE or IDLE(cancelled)
        cab.transition(CabState.COMPLETED, "Trying illegal transition")
    except InvalidStateTransition as e:
        print(f"Caught expected error: {e}")
        
    print("\n--- Testing Graph BFS ---")
    graph = CityGraph()
    # Let's say cabs are at node 2 and node 19
    ready_cab_nodes = {2, 19}
    
    passenger_node = 24
    print(f"Passenger at node {passenger_node}. Cabs at {ready_cab_nodes}.")
    
    nearest, path = graph.bfs_nearest_cab(passenger_node, ready_cab_nodes)
    print(f"BFS Nearest Cab: Node {nearest}, Path: {path}")
    
    nearest_bf, path_bf = graph.brute_force_nearest(passenger_node, ready_cab_nodes)
    print(f"Brute Force Nearest Cab: Node {nearest_bf}, Path: {path_bf}")

    print("\n--- Testing DFS Route Explorer ---")
    # From cab at 19 to passenger at 24
    routes = graph.dfs_explore_routes(19, 24, max_depth=5)
    print(f"DFS found {len(routes)} routes up to depth 5. Sample: {routes[:3]}")

if __name__ == '__main__':
    run_tests()
