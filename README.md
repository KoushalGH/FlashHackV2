# CabGrid — Real-Time Cab Dispatch Optimizer

A graph-based cab dispatch system that demonstrates the practical superiority of BFS over brute-force approaches for nearest-resource allocation. Built on OS process scheduling principles where each cab operates as a managed process with strict state lifecycle control.

![Python](https://img.shields.io/badge/Python-3.10+-3776AB?style=flat-square&logo=python&logoColor=white)
![Flask](https://img.shields.io/badge/Flask-3.0-000000?style=flat-square&logo=flask&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-green?style=flat-square)

---

## Problem Statement

A cab aggregator startup uses brute-force dispatch — computing the distance from every available cab to every passenger request. This approach is acceptable at small scale but becomes a bottleneck as fleet size grows. At 500 cabs, brute-force dispatch runs 16,000 times slower than a BFS-based approach on the same graph.

CabGrid replaces brute-force dispatch with a BFS traversal over a city modeled as an adjacency-list graph, and restricts the search to only IDLE cabs using an OS-style ready queue.

---

## Algorithms

| Algorithm | Role | Time Complexity |
|-----------|------|-----------------|
| BFS | Finds the nearest IDLE cab from the passenger node (shortest hops) | O(V + E) |
| DFS | Explores alternate pickup routes from a cab to a passenger | O(V + E) |
| Brute Force | Computes shortest path from every cab to passenger — baseline comparison | O(C x (V + E)) |

BFS terminates as soon as the first IDLE cab is found. Brute force exhausts all candidates before selecting the minimum. The difference is measurable at scale.

---

## OS Integration

Each cab is represented as a Process Control Block (PCB) with an enforced state machine. State transitions are validated and logged, illegal transitions raise an exception, and the ready queue is the only source for dispatch candidates.

```
REGISTERED --> IDLE --> DISPATCHED --> EN_ROUTE --> COMPLETED --> IDLE
               (Ready)   (Running)      (Waiting)  (Terminated)
```

**Ready Queue:** BFS only searches cabs present in the ready queue. Once a cab is dispatched, it is immediately removed from the queue. This prevents double-booking and mirrors OS scheduler behavior.

**Mutual Exclusion:** A threading lock (dispatch_lock) wraps the dispatch critical section. Concurrent booking requests cannot read and assign the same cab simultaneously. This is equivalent to a kernel mutex protecting the process scheduler.

**Surge Pricing:** Calculated from the ratio of active to total cabs (the dispatch_engine). Triggers at greater than 60% fleet utilization (1.5x) and greater than 80% (2.0x). The metric is derived directly from the process table state, not a separate tracking variable.

**Auto-Completion Timer:** After dispatch, a background thread simulates ride travel time based on hop count. Cabs with fewer hops complete first and return to the ready queue sooner — analogous to shorter CPU bursts being scheduled first in an SJF scheduler.

---

## Design Decisions

**Why does BFS only search the ready queue?**
An OS scheduler only considers processes in the READY state. Dispatching from the full process table would require filtering by state on every request — the ready queue makes this O(1).

**Why a PCB per cab?**
State, assigned ride, current node, and state history are all stored per cab. This makes the system fully inspectable — any cab's lifecycle can be traced end to end, the same way a process's PCB records its execution history.

**Why validate state transitions?**
Validation prevents logical errors such as dispatching a cab that is already en route, or marking a registered cab as completed. Each transition is checked against a valid transition map before execution.

**Why a separate ready queue instead of filtering the process list?**
Filtering the entire process list on every dispatch is O(n). A set-based ready queue reduces dispatch eligibility checks to O(1) membership lookup.

---

## Benchmark Results

Live results from `python -m backend.benchmark`:

| Nodes | Cabs | BFS Time | Brute Force Time | Speedup |
|-------|------|----------|------------------|---------|
| 25    | 10   | 0.002 ms | 0.082 ms         | 41x     |
| 100   | 50   | 0.002 ms | 0.915 ms         | 538x    |
| 500   | 200  | 0.003 ms | 40.08 ms         | 16,104x |

BFS terminates at the first cab found. Brute force runs a full BFS from every cab before selecting the minimum. The gap compounds with fleet size.

---

## Project Structure

```
FlashHackV2/
├── backend/
│   ├── app.py              Flask server with WebSocket support and dispatch mutex
│   ├── city_graph.py       25-node city graph, BFS and DFS implementations
│   ├── cab_process.py      Cab PCB, state machine, transition validation
│   ├── scheduler.py        Ready queue, process table, lifecycle management
│   ├── dispatcher.py       Orchestrates BFS and brute-force dispatch
│   ├── benchmark.py        Timed comparison across 25, 100, and 500 node graphs
│   ├── surge_pricing.py    Fleet utilization-based surge multiplier
│   └── event_logger.py     Structured event log for all dispatch activity
├── frontend/
│   ├── index.html          Dashboard layout
│   ├── css/style.css       Dark-mode interface
│   └── js/
│       ├── app.js          Dispatch controls, event log, benchmark display
│       ├── graph_viz.js    Canvas graph renderer with BFS wave and route animation
│       ├── state_panel.js  Process table with live state badges
│       └── websocket.js    Socket.IO client and REST API wrappers
├── tests/
│   ├── test_graph.py       Graph initialization, BFS correctness, DFS routes
│   ├── test_cab_process.py PCB initialization, valid and invalid state transitions
│   └── test_scheduler.py   Fleet initialization and full dispatch lifecycle
├── docs/
│   └── architecture.md     System component overview
└── requirements.txt
```

---

## Setup and Usage

**Requirements:** Python 3.10 or later

```bash
git clone https://github.com/KoushalGH/FlashHackV2.git
cd FlashHackV2
pip install -r requirements.txt
```

**Start the server:**
```bash
python -m backend.app
```

Open `http://localhost:5000` in a browser. The dashboard connects automatically via WebSocket.

**Run tests:**
```bash
pytest tests/ -v
```

**Run benchmark:**
```bash
python -m backend.benchmark
```

---

## Tech Stack

- Python 3.12 — Core algorithms and server logic
- Flask and Flask-SocketIO — REST API and real-time WebSocket events
- HTML5 Canvas — Interactive city graph visualization
- Vanilla JavaScript and CSS — Dashboard, animations, and state rendering

---

## Team

FlashHack V2 — Hackathon submission
