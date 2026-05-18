import time
import random
from collections import deque

def run_benchmark():
    print("=== BFS vs Brute Force Benchmark ===")
    print(f"{'Nodes':<8} | {'Cabs':<6} | {'BFS Time (ms)':<15} | {'Brute Force (ms)':<18} | {'Speedup':<8}")
    print("-" * 65)
    
    test_cases = [
        (25, 10),
        (100, 50),
        (500, 200)
    ]
    
    for nodes, cabs in test_cases:
        # Create a mock adjacency graph for benchmarking
        graph = {}
        for i in range(nodes):
            graph[i] = []
            if i > 0: graph[i].append(i-1)
            if i < nodes-1: graph[i].append(i+1)
            # Add a random connection
            graph[i].append(random.randint(0, nodes-1))
            
        ready_cabs = set(random.sample(range(nodes), cabs))
        passenger = random.randint(0, nodes-1)
        
        # BFS Approach
        start_bfs = time.perf_counter()
        queue = deque([(passenger, [passenger])])
        visited = {passenger}
        bfs_cab = None
        while queue:
            curr, path = queue.popleft()
            if curr in ready_cabs:
                bfs_cab = curr
                break
            for n in graph[curr]:
                if n not in visited:
                    visited.add(n)
                    queue.append((n, path + [n]))
        bfs_time = (time.perf_counter() - start_bfs) * 1000
        
        # Brute Force Approach (Check every cab individually)
        start_bf = time.perf_counter()
        min_path = float('inf')
        for cab in ready_cabs:
            q = deque([(cab, [cab])])
            v = {cab}
            while q:
                curr, path = q.popleft()
                if curr == passenger:
                    if len(path) < min_path:
                        min_path = len(path)
                    break
                for n in graph[curr]:
                    if n not in v:
                        v.add(n)
                        q.append((n, path + [n]))
        bf_time = (time.perf_counter() - start_bf) * 1000
        
        speedup = bf_time / bfs_time if bfs_time > 0 else 0
        
        print(f"{nodes:<8} | {cabs:<6} | {bfs_time:<15.4f} | {bf_time:<18.4f} | {speedup:<8.2f}x")

if __name__ == '__main__':
    run_benchmark()
