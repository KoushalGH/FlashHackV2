/**
 * CabGrid — WebSocket Client
 * Manages real-time connection to Flask-SocketIO backend.
 * Handles state changes, dispatch events, surge updates, and log streaming.
 */

const WS = (() => {
    let socket = null;
    const API_BASE = window.location.origin || 'http://localhost:5000';

    /**
     * Initialize WebSocket connection via Socket.IO.
     */
    function connect() {
        // Load Socket.IO client if not already loaded
        if (typeof io === 'undefined') {
            console.warn('[WS] Socket.IO client not loaded. Loading from CDN...');
            const script = document.createElement('script');
            script.src = 'https://cdnjs.cloudflare.com/ajax/libs/socket.io/4.7.5/socket.io.min.js';
            script.onload = () => _initSocket();
            script.onerror = () => {
                console.error('[WS] Failed to load Socket.IO client');
                updateConnectionStatus(false);
            };
            document.head.appendChild(script);
            return;
        }
        _initSocket();
    }

    function _initSocket() {
        try {
            socket = io(API_BASE, {
                transports: ['websocket', 'polling'],
                reconnection: true,
                reconnectionDelay: 1000,
                reconnectionAttempts: 10
            });

            socket.on('connect', () => {
                console.log('[WS] Connected to backend');
                updateConnectionStatus(true);
                App.addLogEntry('SYSTEM', 'Connected to backend server', 'system');
                // Fetch initial data
                fetchInitialData();
            });

            socket.on('disconnect', () => {
                console.log('[WS] Disconnected');
                updateConnectionStatus(false);
                App.addLogEntry('SYSTEM', 'Disconnected from backend', 'error');
            });

            // Real-time events from backend
            socket.on('state_change', (data) => {
                App.addLogEntry('STATE', `${data.name || 'Cab-' + data.pid}: ${data.old} → ${data.new}`, 'state');
                refreshCabs();
            });

            socket.on('dispatch_event', (data) => {
                App.addLogEntry('DISPATCH', `${data.cab.name} dispatched via ${data.method.toUpperCase()}`, 'dispatch');
                if (data.route) GraphViz.showRoute(data.route);
                refreshCabs();
            });

            socket.on('surge_update', (data) => {
                updateSurgeBanner(data);
            });

            socket.on('log_entry', (data) => {
                const typeMap = {
                    'RIDE_REQUEST': 'dispatch',
                    'CAB_DISPATCHED': 'dispatch',
                    'STATE_TRANSITION': 'state',
                    'ROUTE_FOUND': 'route',
                    'SURGE_TRIGGERED': 'surge',
                    'ERROR': 'error',
                    'SYSTEM': 'system',
                    'BENCHMARK': 'route'
                };
                App.addLogEntry(data.event, data.message, typeMap[data.event] || 'system');
            });

        } catch (err) {
            console.error('[WS] Connection error:', err);
            updateConnectionStatus(false);
        }
    }

    // ===== REST API Calls =====

    async function fetchInitialData() {
        try {
            const [graphRes, cabsRes] = await Promise.all([
                fetch(`${API_BASE}/api/graph`),
                fetch(`${API_BASE}/api/cabs`)
            ]);

            if (graphRes.ok) {
                const graphData = await graphRes.json();
                GraphViz.setGraphData(graphData);
            }

            if (cabsRes.ok) {
                const cabsData = await cabsRes.json();
                StatePanel.render(cabsData.cabs);
                GraphViz.setCabs(cabsData.cabs);
            }

            // Populate dropdown from real graph data
            populateDropdownFromAPI();

        } catch (err) {
            console.warn('[WS] Could not fetch initial data:', err.message);
        }
    }

    async function populateDropdownFromAPI() {
        try {
            const res = await fetch(`${API_BASE}/api/graph`);
            if (!res.ok) return;
            const data = await res.json();

            const select = document.getElementById('passenger-node');
            if (!select) return;

            // Clear existing options except the placeholder
            while (select.options.length > 1) select.remove(1);

            data.nodes
                .sort((a, b) => a.name.localeCompare(b.name))
                .forEach(node => {
                    const opt = document.createElement('option');
                    opt.value = node.id;
                    opt.textContent = `[${node.id}] ${node.name}`;
                    select.appendChild(opt);
                });
        } catch (err) {
            // Use mock data from StatePanel if API unavailable
        }
    }

    async function refreshCabs() {
        try {
            const res = await fetch(`${API_BASE}/api/cabs`);
            if (!res.ok) return;
            const data = await res.json();
            StatePanel.render(data.cabs);
            GraphViz.setCabs(data.cabs);
        } catch (err) {
            // Silently fail — will retry on next event
        }
    }

    /**
     * Dispatch a ride via the API.
     * @param {number} passengerNode - The pickup node ID
     * @param {string} method - "bfs" or "brute"
     */
    async function dispatch(passengerNode, method) {
        try {
            const res = await fetch(`${API_BASE}/api/dispatch`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ passenger_node: passengerNode, method: method })
            });

            const data = await res.json();

            if (data.error) {
                App.addLogEntry('ERROR', data.error, 'error');
                return data;
            }

            // Trigger BFS wave animation
            if (method === 'bfs') {
                GraphViz.triggerBfsWave(passengerNode);
            }

            // Show route on graph
            if (data.route) {
                setTimeout(() => GraphViz.showRoute(data.route), 500);
            }

            // Update process table and cabs on graph
            if (data.process_table) {
                StatePanel.render(data.process_table);
                GraphViz.setCabs(data.process_table);
            }

            // Update surge banner
            if (data.surge) {
                updateSurgeBanner(data.surge);
            }

            return data;

        } catch (err) {
            App.addLogEntry('ERROR', `API call failed: ${err.message}`, 'error');
            return { error: err.message };
        }
    }

    /**
     * Run benchmark via the API.
     */
    async function runBenchmark() {
        try {
            const res = await fetch(`${API_BASE}/api/benchmark`, { method: 'POST' });
            const data = await res.json();
            return data;
        } catch (err) {
            App.addLogEntry('ERROR', `Benchmark API failed: ${err.message}`, 'error');
            return null;
        }
    }

    /**
     * Complete all rides via the API.
     */
    async function completeAll() {
        try {
            const res = await fetch(`${API_BASE}/api/complete`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ all: true })
            });
            const data = await res.json();

            if (data.process_table) {
                StatePanel.render(data.process_table);
                GraphViz.setCabs(data.process_table);
            }
            if (data.surge) updateSurgeBanner(data.surge);

            GraphViz.clearAnimations();
            return data;
        } catch (err) {
            App.addLogEntry('ERROR', `Complete API failed: ${err.message}`, 'error');
            return null;
        }
    }

    // ===== UI Helpers =====

    function updateConnectionStatus(online) {
        const dot = document.querySelector('#connection-status .status-dot');
        const text = document.querySelector('#connection-status .status-text');
        if (dot) {
            dot.className = `status-dot ${online ? 'online' : 'offline'}`;
        }
        if (text) {
            text.textContent = online ? 'Live' : 'Offline';
        }
    }

    function updateSurgeBanner(surgeData) {
        const banner = document.getElementById('surge-banner');
        if (!banner) return;

        if (surgeData.active) {
            banner.style.display = 'flex';
            banner.querySelector('.surge-text').textContent = `SURGE ${surgeData.multiplier}x`;
        } else {
            banner.style.display = 'none';
        }
    }

    /**
     * Check if we're connected to the backend.
     */
    function isConnected() {
        return socket && socket.connected;
    }

    return {
        connect,
        dispatch,
        runBenchmark,
        completeAll,
        refreshCabs,
        isConnected,
        API_BASE
    };
})();
