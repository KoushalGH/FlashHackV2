from collections import deque
from typing import List, Dict, Any, Optional

class CityGraph:
    def __init__(self):
        # 5x5 Grid City Graph
        self.nodes = {}
        self.edges = {i: [] for i in range(25)}
        
        # Build 5x5 grid nodes
        for row in range(5):
            for col in range(5):
                node_id = row * 5 + col
                self.nodes[node_id] = {
                    "id": node_id,
                    "name": f"Intersection {node_id}",
                    "x": col * 100 + 50, # Scaled for Canvas
                    "y": row * 100 + 50
                }
                
                # Connect to adjacent nodes
                if col > 0: # Left
                    self._add_edge(node_id, node_id - 1)
                if col < 4: # Right
                    self._add_edge(node_id, node_id + 1)
                if row > 0: # Up
                    self._add_edge(node_id, node_id - 5)
                if row < 4: # Down
                    self._add_edge(node_id, node_id + 5)
                    
        # Add a few diagonal shortcuts for interest
        self._add_edge(0, 6)
        self._add_edge(4, 8)
        self._add_edge(12, 18)
        self._add_edge(20, 16)
        self._add_edge(24, 18)

    def _add_edge(self, u: int, v: int):
        if v not in self.edges[u]:
            self.edges[u].append(v)
        if u not in self.edges[v]:
            self.edges[v].append(u)

    def bfs_nearest_cab(self, start_node: int, ready_cab_nodes: set) -> tuple[Optional[int], List[int]]:
        """
        Searches outward from passenger using BFS. 
        Returns the (nearest_cab_node, path) or (None, [])
        """
        if start_node in ready_cab_nodes:
            return start_node, [start_node]
            
        queue = deque([(start_node, [start_node])])
        visited = {start_node}
        
        while queue:
            current, path = queue.popleft()
            
            for neighbor in self.edges[current]:
                if neighbor not in visited:
                    new_path = path + [neighbor]
                    if neighbor in ready_cab_nodes:
                        # Since BFS expands level by level, the first cab found is the nearest
                        # Reversing path since BFS went from passenger to cab, we want route from cab to passenger
                        return neighbor, new_path[::-1]
                        
                    visited.add(neighbor)
                    queue.append((neighbor, new_path))
                    
        return None, []

    def dfs_explore_routes(self, start_node: int, end_node: int, max_depth: int = 10) -> List[List[int]]:
        """
        Explores all possible routes from cab to passenger up to max_depth.
        Returns list of paths.
        """
        routes = []
        
        def dfs(current, path):
            if current == end_node:
                routes.append(list(path))
                return
            if len(path) > max_depth:
                return
                
            for neighbor in self.edges[current]:
                if neighbor not in path:
                    path.append(neighbor)
                    dfs(neighbor, path)
                    path.pop()
                    
        dfs(start_node, [start_node])
        return routes
        
    def brute_force_nearest(self, start_node: int, ready_cab_nodes: set) -> tuple[Optional[int], List[int]]:
        """
        Baseline for benchmarking: Computes distance to EVERY cab individually, then picks minimum.
        """
        if not ready_cab_nodes:
            return None, []
            
        shortest_path = None
        nearest_cab = None
        min_length = float('inf')
        
        for cab_node in ready_cab_nodes:
            # We compute shortest path for each cab specifically
            path = self._shortest_path(cab_node, start_node)
            if path and len(path) < min_length:
                min_length = len(path)
                shortest_path = path
                nearest_cab = cab_node
                
        return nearest_cab, shortest_path or []
        
    def _shortest_path(self, start: int, end: int) -> Optional[List[int]]:
        """ Helper for brute-force: BFS from start specifically to end """
        if start == end: return [start]
        queue = deque([(start, [start])])
        visited = {start}
        while queue:
            curr, path = queue.popleft()
            for neighbor in self.edges[curr]:
                if neighbor == end: return path + [neighbor]
                if neighbor not in visited:
                    visited.add(neighbor)
                    queue.append((neighbor, path + [neighbor]))
        return None
