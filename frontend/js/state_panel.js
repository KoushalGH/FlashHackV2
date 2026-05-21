/**
 * CabGrid — Process Table (State Panel)
 * Renders the cab fleet as an OS process table with PCBs.
 * Uses mock data until backend is connected (Hour 2).
 */

const StatePanel = (() => {
    // Mock cab fleet data (matches Member A's integration contract)
    const MOCK_CABS = [
        { pid: 1, name: "Cab-01", state: "IDLE",       node: 0,  ride: null },
        { pid: 2, name: "Cab-02", state: "IDLE",       node: 5,  ride: null },
        { pid: 3, name: "Cab-03", state: "DISPATCHED", node: 8,  ride: { passenger_node: 12 } },
        { pid: 4, name: "Cab-04", state: "IDLE",       node: 14, ride: null },
        { pid: 5, name: "Cab-05", state: "EN_ROUTE",   node: 10, ride: { passenger_node: 3 } },
        { pid: 6, name: "Cab-06", state: "IDLE",       node: 19, ride: null },
        { pid: 7, name: "Cab-07", state: "IDLE",       node: 22, ride: null },
        { pid: 8, name: "Cab-08", state: "COMPLETED",  node: 7,  ride: null },
        { pid: 9, name: "Cab-09", state: "IDLE",       node: 16, ride: null },
        { pid: 10, name: "Cab-10", state: "IDLE",      node: 2,  ride: null },
    ];

    // Mock node names for display
    const NODE_NAMES = {
        0: "Central Station", 1: "Airport", 2: "Mall Junction", 3: "Tech Park",
        4: "Hospital", 5: "University", 6: "City Hall", 7: "Stadium",
        8: "Market Square", 9: "Bus Terminal", 10: "Railway Crossing",
        11: "Harbor Point", 12: "Convention Center", 13: "Old Town",
        14: "Business District", 15: "Residential North", 16: "Lake View",
        17: "Industrial Zone", 18: "School Road", 19: "Park Avenue",
        20: "Highway Junction", 21: "Metro Station", 22: "Museum Lane",
        23: "Theater Road", 24: "Riverside"
    };

    let currentCabs = [...MOCK_CABS];

    /**
     * Render the process table into the container.
     * @param {Array} cabs - Array of cab PCB objects
     */
    function render(cabs) {
        if (cabs) currentCabs = cabs;
        const container = document.getElementById('process-table-container');
        if (!container) return;

        const stateClass = (state) => (state || '').toLowerCase().replace('_', '_');

        let html = `
            <table class="process-table">
                <thead>
                    <tr>
                        <th>PID</th>
                        <th>Name</th>
                        <th>State</th>
                        <th>Node</th>
                        <th>Assigned Ride</th>
                    </tr>
                </thead>
                <tbody>
        `;

        currentCabs.forEach(cab => {
            // Normalize backend format: current_node vs node, assigned_ride vs ride
            const nodeId   = cab.current_node !== undefined ? cab.current_node : cab.node;
            const rideData = cab.assigned_ride !== undefined ? cab.assigned_ride : cab.ride;
            const cabName  = cab.name || `Cab-${String(cab.pid).padStart(2, '0')}`;
            const state    = cab.state || 'IDLE';

            const nodeName = NODE_NAMES[nodeId] !== undefined ? NODE_NAMES[nodeId] : `Node ${nodeId}`;
            const rideInfo = rideData
                ? (() => {
                    const pickup = NODE_NAMES[rideData.passenger_node] || `Node ${rideData.passenger_node}`;
                    const destId = rideData.destination_node;
                    if (destId !== undefined && destId !== rideData.passenger_node) {
                        const dest = NODE_NAMES[destId] || `Node ${destId}`;
                        return `${pickup} → ${dest}`;
                    }
                    return `→ ${pickup}`;
                })()
                : '—';
            const sc = stateClass(state);

            html += `
                <tr data-pid="${cab.pid}" class="cab-row">
                    <td class="pid-cell">P${String(cab.pid).padStart(2, '0')}</td>
                    <td>${cabName}</td>
                    <td><span class="state-badge ${sc}">${state}</span></td>
                    <td title="${nodeName}">${nodeName}</td>
                    <td>${rideInfo}</td>
                </tr>
            `;
        });

        html += '</tbody></table>';
        container.innerHTML = html;

        updateFleetStats(currentCabs);
    }

    /**
     * Update the header fleet statistics.
     */
    function updateFleetStats(cabs) {
        const total = cabs.length;
        // Count using both field formats (backend: state string, mock: state string)
        const idle = cabs.filter(c => (c.state || '') === 'IDLE').length;
        const active = cabs.filter(c => ['DISPATCHED', 'EN_ROUTE'].includes(c.state || '')).length;

        const elTotal = document.getElementById('stat-total');
        const elIdle = document.getElementById('stat-idle');
        const elDispatched = document.getElementById('stat-dispatched');

        if (elTotal) elTotal.textContent = total;
        if (elIdle) elIdle.textContent = idle;
        if (elDispatched) elDispatched.textContent = active;
    }

    /**
     * Update a single cab's state (for real-time WebSocket updates).
     */
    function updateCabState(pid, newState, ride) {
        const cab = currentCabs.find(c => c.pid === pid);
        if (cab) {
            cab.state = newState;
            if (ride !== undefined) cab.ride = ride;
            render();

            // Flash animation on the updated row
            const row = document.querySelector(`tr[data-pid="${pid}"]`);
            if (row) {
                row.classList.remove('flash');
                void row.offsetWidth; // trigger reflow for re-animation
                row.classList.add('flash');
            }

            // Trigger cab flash on graph canvas
            if (typeof GraphViz !== 'undefined' && newState === 'DISPATCHED') {
                GraphViz.flashCab(pid);
            }
        }
    }

    /**
     * Get current cab data.
     */
    function getCabs() {
        return currentCabs;
    }

    /**
     * Get mock node names for dropdowns.
     */
    function getNodeNames() {
        return NODE_NAMES;
    }

    // Public API
    return { render, updateCabState, getCabs, getNodeNames, NODE_NAMES };
})();

// Initialize on load
document.addEventListener('DOMContentLoaded', () => {
    StatePanel.render();
});
