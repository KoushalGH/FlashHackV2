# 🚕 CabGrid — Real-Time Cab Dispatch Optimizer

> **Domain:** Transport & Logistics  
> **Algorithms:** BFS/DFS & Brute Force Comparison  
> **OS Concepts:** Process State Management  

![Python](https://img.shields.io/badge/Python-3.10+-3776AB?style=for-the-badge&logo=python&logoColor=white)
![Flask](https://img.shields.io/badge/Flask-3.0-000000?style=for-the-badge&logo=flask&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-green?style=for-the-badge)

## 🎯 Problem Statement

A cab aggregator startup struggles with dispatch logic — brute-forcing through all available cabs works fine with 10 cabs but **completely chokes at 500**. CabGrid implements a smarter **graph traversal-based approach** using BFS to find the nearest available cab across a city modelled as a graph.

## 🧠 Core Concepts

### DAA (Design & Analysis of Algorithms)
| Algorithm | Purpose | Complexity |
|-----------|---------|-----------|
| **BFS** | Nearest cab search (shortest hops) | O(V + E) |
| **DFS** | Route exploration from cab → passenger | O(V + E) |
| **Brute Force** | Baseline comparison (compute distance to ALL cabs) | O(C × (V + E)) |

### OS (Operating Systems)
Each cab is modeled as a **process** with defined states:

```
┌──────┐     ┌────────────┐     ┌──────────┐     ┌───────────┐
│ IDLE │ ──→ │ DISPATCHED │ ──→ │ EN_ROUTE │ ──→ │ COMPLETED │
│(Ready)│     │ (Running)  │     │ (Waiting)│     │(Terminated)│
└──────┘     └────────────┘     └──────────┘     └───────────┘
    ↑                                                   │
    └───────────────────────────────────────────────────┘
```

## 🔑 Design Decisions

1. **"Why does BFS only search the ready queue?"** — Like an OS scheduler only considers READY processes, our dispatcher only considers IDLE cabs. Makes BFS faster AND semantically correct.
2. **"Why a PCB per cab?"** — Each cab carries state, context (ride, route), and history. Mirrors PCBs in operating systems. Makes the system debuggable — inspect any cab's full lifecycle.
3. **"Why validate state transitions?"** — Prevents double-dispatching (like an OS can't schedule an already-running process). Real mutual exclusion on cab resources.
4. **"Why separate ready queue?"** — O(1) queue management vs O(n) scanning all cabs. Same reason OS maintains a ready queue instead of scanning the full process table.

## ✨ Features

- 🗺️ **City Graph Model** — 25 intersections, 40+ roads as an adjacency list
- ⚡ **BFS Dispatch** — Find nearest available cab in minimal hops
- 🔍 **DFS Route Explorer** — Discover all possible pickup routes
- 🔄 **Process State Machine** — Full cab lifecycle management with transition logging
- 📊 **BFS vs Brute Force Benchmark** — Performance comparison on 25–500 node graphs
- 💰 **Surge Pricing** — Auto-triggers when >60% cabs are dispatched
- 🖥️ **Live Web Dashboard** — Real-time graph visualization with animated dispatch

## 🚀 Quick Start

### Prerequisites
- Python 3.10+
- pip

### Installation
```bash
# Clone the repo
git clone https://github.com/YOUR_USERNAME/FlashHackV2.git
cd FlashHackV2

# Create virtual environment
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt
```

### Run the Application
```bash
# Start the server
python -m backend.app

# Open in browser
# http://localhost:5000
```

### Run Tests
```bash
pytest tests/ -v
```

### Run Benchmark
```bash
python -m backend.benchmark
```

## 📁 Project Structure

```
FlashHackV2/
├── backend/
│   ├── app.py                   # Flask + WebSocket server
│   ├── city_graph.py            # City graph, BFS, DFS algorithms
│   ├── cab_process.py           # Cab process state machine (PCB)
│   ├── scheduler.py             # OS-style cab scheduler & ready queue
│   ├── dispatcher.py            # Dispatch logic (BFS + Brute Force)
│   ├── benchmark.py             # Performance benchmarking
│   ├── surge_pricing.py         # Surge pricing engine
│   └── event_logger.py          # Structured event logger
├── frontend/
│   ├── index.html               # Dashboard UI
│   ├── css/style.css            # Dark-mode styling
│   └── js/                      # Client-side logic
├── tests/                       # pytest test suite
├── docs/                        # Documentation
├── requirements.txt
└── README.md
```

## 📊 Benchmark Results

| Nodes | Cabs | BFS Time | Brute Force Time | Speedup |
|-------|------|----------|-----------------|---------|
| 25    | 10   | ~0.1ms   | ~0.5ms          | ~5x     |
| 100   | 50   | ~0.3ms   | ~9ms            | ~30x    |
| 500   | 200  | ~1.2ms   | ~200ms          | ~160x   |

*BFS stops at the first cab found; Brute Force computes distance to every cab.*

## 🏗️ Built With

- **Python** — Core logic and algorithms
- **Flask + Flask-SocketIO** — Real-time web server
- **HTML5 Canvas** — Graph visualization
- **Vanilla CSS/JS** — Premium dark-mode dashboard

## 👥 Team

- **Team Name**: FlashHack V2

## 📄 License

This project is licensed under the MIT License.
