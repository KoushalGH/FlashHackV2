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
                // Backend emits: {pid, old_state, new_state, reason, timestamp}
                const cabName = data.name || `Cab-${String(data.pid).padStart(2, '0')}`;
                const oldState = data.old_state || data.old || '?';
                const newState = data.new_state || data.new || '?';
                App.addLogEntry('STATE', `${cabName}: ${oldState} → ${newState}`, 'state');
                if (newState === 'IDLE') {
                    GraphViz.clearRouteForCab(data.pid);
                }
                refreshCabs();
            });

            socket.on('dispatch_event', (data) => {
                // Backend cab dict has no 'name' field — generate it from pid
                const cabName = (data.cab && data.cab.name)
                    ? data.cab.name
                    : `Cab-${String(data.cab && data.cab.pid || '?').padStart(2, '0')}`;
                const method = (data.method || 'bfs').toUpperCase();
                App.addLogEntry('DISPATCH', `${cabName} dispatched via ${method}`, 'dispatch');
                if (data.route) {
                    const pid = data.cab && data.cab.pid;
                    GraphViz.showRoute(data.route, pid, 6);
                }
                refreshCabs();
            });

            socket.on('surge_update', (data) => {
                updateSurgeBanner(data);
            });

            socket.on('log_entry', (data) => {
                const typeMap = {
                    'RIDE_REQUEST':    'dispatch',
                    'CAB_DISPATCHED':  'dispatch',
                    'STATE_TRANSITION':'state',
                    'DFS_ROUTES':      'route',
                    'ROUTE_FOUND':     'route',
                    'PROCESS_TABLE':   'system',
                    'SURGE_TRIGGERED': 'surge',
                    'SYSTEM_ERROR':    'error',
                    'ERROR':           'error',
                    'SYSTEM':          'system',
                    'BENCHMARK':       'route'
                };
                // Backend sends: {event, details} — NOT {event, message}
                const msg = data.details || data.message || '—';
                App.addLogEntry(data.event, msg, typeMap[data.event] || 'system');
            });

            // Auto-completion event — cab finished ride, moved to destination
            socket.on('ride_completed', (data) => {
                const cabName = data.cab_name || `Cab-${String(data.pid).padStart(2, '0')}`;
                const nodeName = (StatePanel.NODE_NAMES && StatePanel.NODE_NAMES[data.dest_node])
                    ? StatePanel.NODE_NAMES[data.dest_node] : `Node ${data.dest_node}`;
                App.addLogEntry('STATE',
                    `${cabName}: EN_ROUTE → COMPLETED → IDLE — now at ${nodeName}`,
                    'state');
                if (data.process_table) {
                    StatePanel.render(data.process_table);
                    GraphViz.setCabs(data.process_table);
                    GraphViz.syncRouteWithFleet(data.process_table);
                    const cab = data.process_table.find(c => c.pid === data.pid);
                    if (cab && cab.state === 'IDLE') {
                        GraphViz.clearRouteForCab(data.pid);
                    }
                }
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
                GraphViz.syncRouteWithFleet(cabsData.cabs);
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

            const selPickup = document.getElementById('passenger-node');
            const selDest   = document.getElementById('destination-node');
            if (!selPickup) return;

            // Clear all except placeholder
            while (selPickup.options.length > 1) selPickup.remove(1);
            if (selDest) while (selDest.options.length > 1) selDest.remove(1);

            // Sort numerically by node ID (not alphabetically)
            const sorted = [...data.nodes].sort((a, b) => a.id - b.id);
            sorted.forEach(node => {
                const realName = (StatePanel.NODE_NAMES && StatePanel.NODE_NAMES[node.id])
                    ? StatePanel.NODE_NAMES[node.id] : node.name;
                const label = `[${node.id}] ${realName}`;

                const optP = document.createElement('option');
                optP.value = node.id; optP.textContent = label;
                selPickup.appendChild(optP);

                if (selDest) {
                    const optD = document.createElement('option');
                    optD.value = node.id; optD.textContent = label;
                    selDest.appendChild(optD);
                }
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
            GraphViz.syncRouteWithFleet(data.cabs);
        } catch (err) {
            // Silently fail — will retry on next event
        }
    }

    /** Poll cab state after dispatch so route clears when ride ends (WS may be down). */
    function schedulePostDispatchSync() {
        [2500, 5500, 7500].forEach(ms => setTimeout(() => refreshCabs(), ms));
    }

    /**
     * Dispatch a ride via the API.
     * @param {number} passengerNode - The pickup node ID
     * @param {string} method - "bfs" or "brute"
     */
    async function dispatch(passengerNode, method, destinationNode) {
        try {
            const body = {
                passenger_node: passengerNode,
                method: method
            };
            if (destinationNode !== undefined && destinationNode !== null) {
                body.destination_node = destinationNode;
            }

            const res = await fetch(`${API_BASE}/api/dispatch`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
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
                const routePid = data.cab_pid || (data.cab && data.cab.pid);
                const clearSecs = data.auto_complete_secs != null ? data.auto_complete_secs : 6;
                setTimeout(() => GraphViz.showRoute(data.route, routePid, clearSecs), 500);
            }

            // Update process table and cabs on graph
            if (data.process_table) {
                StatePanel.render(data.process_table);
                GraphViz.setCabs(data.process_table);
                GraphViz.syncRouteWithFleet(data.process_table);
            }

            schedulePostDispatchSync();

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
                GraphViz.syncRouteWithFleet(data.process_table);
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

    function normalizeSurge(surgeData) {
        if (surgeData == null) return null;
        if (typeof surgeData === 'number') {
            return { active: surgeData > 1.0, multiplier: surgeData };
        }
        return surgeData;
    }

    function updateSurgeBanner(surgeData) {
        const banner = document.getElementById('surge-banner');
        if (!banner) return;

        const surge = normalizeSurge(surgeData);
        if (!surge) return;

        if (surge.active) {
            banner.style.display = 'flex';
            banner.querySelector('.surge-text').textContent = `SURGE ${surge.multiplier}x`;
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
