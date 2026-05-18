/**
 * CabGrid — Main Application Controller
 * Handles dispatch controls, event log, benchmark display,
 * and state diagram toggle. Uses mock responses until backend wiring (Hour 2).
 */

const App = (() => {
    // ===== Dispatch Controls =====

    /**
     * Populate the passenger node dropdown from node names.
     */
    function populateNodeDropdown() {
        const select = document.getElementById('passenger-node');
        if (!select) return;

        const nodes = StatePanel.getNodeNames();
        Object.entries(nodes)
            .sort((a, b) => a[1].localeCompare(b[1]))
            .forEach(([id, name]) => {
                const opt = document.createElement('option');
                opt.value = id;
                opt.textContent = `[${id}] ${name}`;
                select.appendChild(opt);
            });
    }

    /**
     * Handle dispatch button click (mock response for now).
     */
    function handleDispatch(method) {
        const nodeSelect = document.getElementById('passenger-node');
        const passengerNode = parseInt(nodeSelect.value);

        if (isNaN(passengerNode)) {
            addLogEntry('ERROR', 'No pickup node selected', 'error');
            return;
        }

        const nodeName = StatePanel.NODE_NAMES[passengerNode] || `Node ${passengerNode}`;
        addLogEntry('RIDE_REQUEST', `Passenger at ${nodeName} (Node ${passengerNode})`, 'dispatch');

        // In Hour 2, this will call POST /api/dispatch
        // For now, show mock result
        const mockResult = generateMockDispatch(passengerNode, method);
        showDispatchResult(mockResult);

        // Mock state transitions
        if (mockResult.cab) {
            addLogEntry('STATE', `${mockResult.cab.name}: IDLE → DISPATCHED (assigned ride)`, 'state');
            addLogEntry('STATE', `${mockResult.cab.name}: DISPATCHED → EN_ROUTE (route computed)`, 'state');
            addLogEntry('DISPATCH', `${mockResult.cab.name} dispatched via ${method.toUpperCase()} — ${mockResult.hops} hops, ${mockResult.time_ms}ms`, 'dispatch');

            StatePanel.updateCabState(mockResult.cab.pid, 'EN_ROUTE', { passenger_node: passengerNode });
        }
    }

    /**
     * Generate a mock dispatch result for demo purposes.
     */
    function generateMockDispatch(passengerNode, method) {
        const cabs = StatePanel.getCabs().filter(c => c.state === 'IDLE');
        if (cabs.length === 0) {
            addLogEntry('ERROR', 'No cabs available in ready queue!', 'error');
            return { error: 'No cabs in ready queue' };
        }

        const selectedCab = cabs[Math.floor(Math.random() * cabs.length)];
        const hops = Math.floor(Math.random() * 5) + 1;
        const timeBfs = (Math.random() * 0.5 + 0.05).toFixed(3);
        const timeBrute = (Math.random() * 5 + 1).toFixed(3);

        // Generate mock route
        const route = [selectedCab.node];
        let current = selectedCab.node;
        for (let i = 0; i < hops; i++) {
            current = (current + Math.floor(Math.random() * 3) + 1) % 25;
            route.push(current);
        }
        route[route.length - 1] = passengerNode;

        return {
            cab: selectedCab,
            method: method,
            hops: hops,
            time_ms: method === 'bfs' ? timeBfs : timeBrute,
            route: route,
            alternatives: [route.slice().reverse()],
        };
    }

    /**
     * Display dispatch result in the result panel.
     */
    function showDispatchResult(result) {
        const panel = document.getElementById('dispatch-result');
        if (!panel || result.error) {
            if (panel) panel.style.display = 'none';
            return;
        }

        panel.style.display = 'block';
        document.getElementById('result-cab').textContent = result.cab.name;
        document.getElementById('result-method').textContent = result.method.toUpperCase();
        document.getElementById('result-hops').textContent = `${result.hops} hops`;
        document.getElementById('result-time').textContent = `${result.time_ms} ms`;

        const routeNames = result.route.map(n => StatePanel.NODE_NAMES[n] || `N${n}`);
        document.getElementById('result-route').textContent = routeNames.join(' → ');

        // Animate result panel
        panel.style.animation = 'none';
        panel.offsetHeight; // trigger reflow
        panel.style.animation = 'logSlide 0.3s ease-out';
    }

    // ===== Benchmark =====

    function handleBenchmark() {
        addLogEntry('BENCHMARK', 'Running BFS vs Brute Force comparison...', 'route');

        // Mock benchmark data (replaced with real API call in Hour 2)
        const results = [
            { nodes: 25,  cabs: 10,  bfs_ms: 0.12,  brute_ms: 0.45,  speedup: '3.8x' },
            { nodes: 100, cabs: 50,  bfs_ms: 0.34,  brute_ms: 8.72,  speedup: '25.6x' },
            { nodes: 200, cabs: 80,  bfs_ms: 0.67,  brute_ms: 42.1,  speedup: '62.8x' },
            { nodes: 500, cabs: 200, bfs_ms: 1.23,  brute_ms: 198.5, speedup: '161.4x' },
        ];

        showBenchmarkResult(results);
        addLogEntry('BENCHMARK', 'Benchmark complete — BFS significantly outperforms brute force', 'route');
    }

    function showBenchmarkResult(results) {
        const container = document.getElementById('benchmark-result');
        const table = document.getElementById('benchmark-table');
        if (!container || !table) return;

        container.style.display = 'block';
        let html = `
            <table class="benchmark-table">
                <thead>
                    <tr><th>Nodes</th><th>Cabs</th><th>BFS (ms)</th><th>Brute (ms)</th><th>Speedup</th></tr>
                </thead>
                <tbody>
        `;
        results.forEach(r => {
            html += `<tr>
                <td>${r.nodes}</td><td>${r.cabs}</td>
                <td>${r.bfs_ms}</td><td>${r.brute_ms}</td>
                <td class="speedup">${r.speedup}</td>
            </tr>`;
        });
        html += '</tbody></table>';
        table.innerHTML = html;
    }

    // ===== Complete All Rides =====

    function handleCompleteAll() {
        const cabs = StatePanel.getCabs();
        let completed = 0;
        cabs.forEach(cab => {
            if (cab.state === 'EN_ROUTE' || cab.state === 'DISPATCHED') {
                addLogEntry('STATE', `${cab.name}: ${cab.state} → COMPLETED → IDLE`, 'state');
                StatePanel.updateCabState(cab.pid, 'IDLE', null);
                completed++;
            }
        });
        if (completed > 0) {
            addLogEntry('SYSTEM', `${completed} ride(s) completed. Cabs returned to ready queue.`, 'system');
        } else {
            addLogEntry('SYSTEM', 'No active rides to complete.', 'system');
        }
    }

    // ===== Event Log =====

    function addLogEntry(event, message, type) {
        const container = document.getElementById('log-container');
        if (!container) return;

        const now = new Date();
        const time = now.toLocaleTimeString('en-US', { hour12: false });

        const entry = document.createElement('div');
        entry.className = `log-entry log-${type}`;
        entry.innerHTML = `
            <span class="log-time">${time}</span>
            <span class="log-badge ${type}">${event}</span>
            <span class="log-message">${message}</span>
        `;

        container.appendChild(entry);
        container.scrollTop = container.scrollHeight;
    }

    function clearLog() {
        const container = document.getElementById('log-container');
        if (container) container.innerHTML = '';
        addLogEntry('SYSTEM', 'Log cleared.', 'system');
    }

    // ===== State Diagram Toggle =====

    function setupStateDiagram() {
        const toggle = document.getElementById('state-diagram-toggle');
        const overlay = document.getElementById('state-diagram-overlay');
        const close = document.getElementById('btn-close-diagram');

        if (toggle) toggle.addEventListener('click', () => { overlay.style.display = 'flex'; });
        if (close) close.addEventListener('click', () => { overlay.style.display = 'none'; });
        if (overlay) overlay.addEventListener('click', (e) => {
            if (e.target === overlay) overlay.style.display = 'none';
        });
    }

    // ===== Surge Pricing Check =====

    function checkSurge() {
        const cabs = StatePanel.getCabs();
        const total = cabs.length;
        const active = cabs.filter(c => ['DISPATCHED', 'EN_ROUTE'].includes(c.state)).length;
        const ratio = active / total;

        const banner = document.getElementById('surge-banner');
        if (!banner) return;

        if (ratio > 0.8) {
            banner.style.display = 'flex';
            banner.querySelector('.surge-text').textContent = 'SURGE 2.0x';
            addLogEntry('SURGE', `High surge activated! ${(ratio * 100).toFixed(0)}% fleet active — 2.0x multiplier`, 'surge');
        } else if (ratio > 0.6) {
            banner.style.display = 'flex';
            banner.querySelector('.surge-text').textContent = 'SURGE 1.5x';
            addLogEntry('SURGE', `Surge activated! ${(ratio * 100).toFixed(0)}% fleet active — 1.5x multiplier`, 'surge');
        } else {
            banner.style.display = 'none';
        }
    }

    // ===== Initialize =====

    function init() {
        populateNodeDropdown();
        setupStateDiagram();

        // Dispatch buttons
        const btnBfs = document.getElementById('btn-dispatch-bfs');
        const btnBrute = document.getElementById('btn-dispatch-brute');
        const btnBench = document.getElementById('btn-benchmark');
        const btnComplete = document.getElementById('btn-complete-all');
        const btnClearLog = document.getElementById('btn-clear-log');

        if (btnBfs) btnBfs.addEventListener('click', () => { handleDispatch('bfs'); checkSurge(); });
        if (btnBrute) btnBrute.addEventListener('click', () => { handleDispatch('brute'); checkSurge(); });
        if (btnBench) btnBench.addEventListener('click', handleBenchmark);
        if (btnComplete) btnComplete.addEventListener('click', handleCompleteAll);
        if (btnClearLog) btnClearLog.addEventListener('click', clearLog);

        addLogEntry('SYSTEM', 'CabGrid dashboard loaded. 10 cabs in fleet.', 'system');
        addLogEntry('SYSTEM', 'Using mock data — connect backend for live dispatch.', 'system');
    }

    // Public API (used by websocket.js in Hour 2)
    return { init, addLogEntry, showDispatchResult, showBenchmarkResult, checkSurge };
})();

document.addEventListener('DOMContentLoaded', () => {
    App.init();
});
