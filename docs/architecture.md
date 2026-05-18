# CabGrid Architecture

## System Overview

CabGrid is a real-time cab dispatch optimizer that demonstrates the superiority of graph traversal algorithms (BFS) over brute-force approaches for the nearest-cab problem.

## Components

### 1. City Graph Engine (`graph.py`)
- Adjacency list representation of city intersections and roads
- BFS implementation for nearest-cab search
- DFS implementation for route exploration
- Brute-force baseline for benchmarking

### 2. Cab Manager (`cab_manager.py`)
- Process state machine: IDLE → DISPATCHED → EN_ROUTE → COMPLETED
- Maps to OS process states: Ready → Running → Waiting → Terminated
- State transition validation and history tracking

### 3. Dispatcher (`dispatcher.py`)
- Orchestrates cab search and assignment
- Integrates BFS search with state transitions
- Produces structured dispatch events

### 4. Benchmark Engine (`benchmark.py`)
- Generates scaled graphs (100–500 nodes)
- Runs BFS vs Brute Force on identical inputs
- Produces timing comparison tables

### 5. Surge Pricing (`surge_pricing.py`)
- Monitors fleet utilization ratio
- Triggers surge multiplier at >60% dispatched
- Real-time pricing events

### 6. Web Dashboard (`frontend/`)
- Canvas-based city graph visualization
- Real-time cab state monitoring
- Interactive dispatch controls
- Live event log streaming
