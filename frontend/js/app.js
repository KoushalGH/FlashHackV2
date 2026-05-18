/**
 * CabGrid — Main Application Controller
 * Handles dispatch controls, event log, benchmark display,
 * and state diagram toggle. Wires to backend API via WS module,
 * falls back to mock data when backend is unavailable.
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
     * Handle dispatch button click — uses API if connected, mock if not.
     */
    async function handleDispatch(method) {
        const nodeSelect = document.getElementById('passenger-node');
        const passengerNode = parseInt(nodeSelect.value);

        if (isNaN(passengerNode)) {
            addLogEntry('ERROR', 'No pickup node selected', 'error');
            return;
        }

        const nodeName = StatePanel.NODE_NAMES[passengerNode] || `Node ${passengerNode}`;
        addLogEntry('RIDE_REQUEST', `Passenger at ${nodeName} (Node ${passengerNode})`, 'dispatch');

        // Disable buttons during dispatch
        setDispatchButtonsEnabled(false);

        let result;

        if (WS.isConnected()) {
            // ===== LIVE API DISPATCH =====
            result = await WS.dispatch(passengerNode, method);

            if (result && !result.error) {
                showDispatchResult(result);

                // Log state transitions from the result
                addLogEntry('STATE',
                    `Cab-${String(result.cab.pid).padStart(2,'0')}: IDLE → DISPATCHED → EN_ROUTE`,
                    'state');
                addLogEntry('DISPATCH',
                    `${result.cab.name} dispatched via ${method.toUpperCase()} — ${result.hops} hops, ${result.time_ms}ms`,
                    'dispatch');

                // Flash the dispatched cab on graph
                if (result.cab.pid) GraphViz.flashCab(result.cab.pid);

                if (result.surge && result.surge.active) {
                    addLogEntry('SURGE',
                        `Surge active! ${(result.surge.ratio * 100).toFixed(0)}% fleet busy — ${result.surge.multiplier}x`,
                        'surge');
                }
            } else if (result && result.error) {
                addLogEntry('ERROR', result.error, 'error');
            }

        } else {
            // ===== MOCK DISPATCH (offline mode) =====
            result = generateMockDispatch(passengerNode, method);
            if (result && !result.error) {
                showDispatchResult(result);
                addLogEntry('STATE', `${result.cab.name}: IDLE → DISPATCHED → EN_ROUTE`, 'state');
                addLogEntry('DISPATCH',
                    `${result.cab.name} dispatched via ${method.toUpperCase()} — ${result.hops} hops, ${result.time_ms}ms [MOCK]`,
                    'dispatch');

                StatePanel.updateCabState(result.cab.pid, 'EN_ROUTE', { passenger_node: passengerNode });

                // Trigger graph animations
                if (method === 'bfs') GraphViz.triggerBfsWave(passengerNode);
                if (result.route) setTimeout(() => GraphViz.showRoute(result.route), 500);
            }

            checkSurge();
        }

        setDispatchButtonsEnabled(true);
    }

    function setDispatchButtonsEnabled(enabled) {
        const btnBfs = document.getElementById('btn-dispatch-bfs');
        const btnBrute = document.getElementById('btn-dispatch-brute');
        if (btnBfs) btnBfs.disabled = !enabled;
        if (btnBrute) btnBrute.disabled = !enabled;
    }

    /**
     * Generate a mock dispatch result for offline demo.
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

        const route = [selectedCab.node];
        let current = selectedCab.node;
        for (let i = 0; i < hops; i++) {
            current = (current + Math.floor(Math.random() * 3) + 1) % 25;
            route.push(current);
        }
        route[route.length - 1] = passengerNode;

        return {
            cab: { pid: selectedCab.pid, name: selectedCab.name || `Cab-${String(selectedCab.pid).padStart(2, '0')}`, node: selectedCab.node },
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
        panel.className = 'dispatch-result';
        void panel.offsetWidth;
        panel.className = 'dispatch-result show';
        document.getElementById('result-cab').textContent = result.cab.name;
        document.getElementById('result-method').textContent = result.method.toUpperCase();
        document.getElementById('result-hops').textContent = `${result.hops} hops`;
        document.getElementById('result-time').textContent = `${result.time_ms} ms`;

        const routeNames = result.route.map(n => {
            const name = StatePanel.NODE_NAMES[n];
            return name ? name : `N${n}`;
        });
        document.getElementById('result-route').textContent = routeNames.join(' → ');

        // Animate result panel
        panel.style.animation = 'none';
        panel.offsetHeight;
        panel.style.animation = 'logSlide 0.3s ease-out';
    }

    // ===== Benchmark =====

    async function handleBenchmark() {
        addLogEntry('BENCHMARK', 'Running BFS vs Brute Force comparison...', 'route');

        let results;

        if (WS.isConnected()) {
            const data = await WS.runBenchmark();
            if (data && data.results) {
                results = data.results;
            }
        }

        // Fallback to mock data
        if (!results) {
            results = [
                { nodes: 25,  cabs: 10,  bfs_ms: 0.12,  brute_ms: 0.45,  speedup: '3.8x' },
                { nodes: 100, cabs: 50,  bfs_ms: 0.34,  brute_ms: 8.72,  speedup: '25.6x' },
                { nodes: 200, cabs: 80,  bfs_ms: 0.67,  brute_ms: 42.1,  speedup: '62.8x' },
                { nodes: 500, cabs: 200, bfs_ms: 1.23,  brute_ms: 198.5, speedup: '161.4x' },
            ];
        }

        showBenchmarkResult(results);
        addLogEntry('BENCHMARK', `Benchmark complete — BFS outperforms brute force across ${results.length} graph sizes`, 'route');
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

    async function handleCompleteAll() {
        if (WS.isConnected()) {
            const data = await WS.completeAll();
            if (data) {
                addLogEntry('SYSTEM', `${data.completed} ride(s) completed. Cabs returned to ready queue.`, 'system');
                GraphViz.clearAnimations();
            }
        } else {
            // Mock: complete all active rides locally
            const cabs = StatePanel.getCabs();
            let completed = 0;
            cabs.forEach(cab => {
                if (cab.state === 'EN_ROUTE' || cab.state === 'DISPATCHED') {
                    StatePanel.updateCabState(cab.pid, 'IDLE', null);
                    completed++;
                }
            });
            if (completed > 0) {
                addLogEntry('SYSTEM', `${completed} ride(s) completed. Cabs returned to ready queue.`, 'system');
            } else {
                addLogEntry('SYSTEM', 'No active rides to complete.', 'system');
            }
            GraphViz.clearAnimations();
            checkSurge();
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

        // Limit log entries to avoid memory issues
        while (container.children.length > 200) {
            container.removeChild(container.firstChild);
        }
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

    // ===== Surge Pricing Check (mock mode) =====

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
        } else if (ratio > 0.6) {
            banner.style.display = 'flex';
            banner.querySelector('.surge-text').textContent = 'SURGE 1.5x';
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

        if (btnBfs) btnBfs.addEventListener('click', () => handleDispatch('bfs'));
        if (btnBrute) btnBrute.addEventListener('click', () => handleDispatch('brute'));
        if (btnBench) btnBench.addEventListener('click', handleBenchmark);
        if (btnComplete) btnComplete.addEventListener('click', handleCompleteAll);
        if (btnClearLog) btnClearLog.addEventListener('click', clearLog);

        addLogEntry('SYSTEM', 'CabGrid dashboard loaded. 10 cabs in fleet.', 'system');

        // Try to connect to backend
        WS.connect();
    }

    // Public API
    return { init, addLogEntry, showDispatchResult, showBenchmarkResult, checkSurge };
})();

document.addEventListener('DOMContentLoaded', () => {
    App.init();
});
