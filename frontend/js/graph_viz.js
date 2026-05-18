/**
 * CabGrid — City Graph Visualization (Canvas)
 * Renders the 25-node city graph with cab positions, BFS wave animation,
 * and route highlighting on an HTML5 Canvas.
 */

const GraphViz = (() => {
    let canvas, ctx;
    let nodes = [];
    let edges = [];
    let cabs = [];
    let animationId = null;

    // Layout config
    const PADDING = 60;
    const NODE_RADIUS = 16;
    const CAB_RADIUS = 8;

    // Colors
    const COLORS = {
        nodeFill: 'rgba(255,255,255,0.04)',
        nodeStroke: 'rgba(255,255,255,0.15)',
        nodeText: 'rgba(255,255,255,0.5)',
        edge: 'rgba(255,255,255,0.06)',
        IDLE: '#00ff88',
        DISPATCHED: '#ff6b35',
        EN_ROUTE: '#4ecdc4',
        COMPLETED: '#6c757d',
        REGISTERED: '#a855f7',
        highlight: '#00ff88',
        bfsWave: 'rgba(0,255,136,0.15)',
        routePath: '#4ecdc4',
    };

    // Animation state
    let bfsWaveCenter = null;
    let bfsWaveRadius = 0;
    let bfsWaveActive = false;
    let highlightRoute = [];
    let highlightRouteProgress = 0;
    let selectedNode = null;

    /**
     * Initialize the canvas and set up resize handling.
     */
    function init() {
        canvas = document.getElementById('city-canvas');
        if (!canvas) return;
        ctx = canvas.getContext('2d');

        resizeCanvas();
        window.addEventListener('resize', resizeCanvas);

        // Click detection on canvas
        canvas.addEventListener('click', handleCanvasClick);

        startRenderLoop();
    }

    function resizeCanvas() {
        const container = canvas.parentElement;
        canvas.width = container.clientWidth;
        canvas.height = container.clientHeight;
    }

    /**
     * Load graph data from API response.
     * @param {Object} graphData - {nodes: [{id, name, x, y}], edges: [[from, to]]}
     */
    function setGraphData(graphData) {
        nodes = graphData.nodes || [];
        edges = graphData.edges || [];

        // Scale node positions to fit canvas with padding
        scaleNodesToCanvas();

        // Hide placeholder
        const placeholder = document.getElementById('canvas-placeholder');
        if (placeholder) placeholder.style.display = 'none';
    }

    /**
     * Update cab positions and states.
     * @param {Array} cabData - [{pid, name, state, current_node, ...}]
     */
    function setCabs(cabData) {
        cabs = cabData || [];
    }

    /**
     * Scale the raw node coordinates (0-500) to fit the canvas.
     */
    function scaleNodesToCanvas() {
        if (!nodes.length || !canvas) return;

        const rawXs = nodes.map(n => n.x);
        const rawYs = nodes.map(n => n.y);
        const minX = Math.min(...rawXs), maxX = Math.max(...rawXs);
        const minY = Math.min(...rawYs), maxY = Math.max(...rawYs);
        const rangeX = maxX - minX || 1;
        const rangeY = maxY - minY || 1;

        const w = canvas.width - PADDING * 2;
        const h = canvas.height - PADDING * 2;

        nodes.forEach(n => {
            n.dx = PADDING + ((n.x - minX) / rangeX) * w;
            n.dy = PADDING + ((n.y - minY) / rangeY) * h;
        });
    }

    /**
     * Handle click on canvas — select a node for dispatch.
     */
    function handleCanvasClick(e) {
        const rect = canvas.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;

        for (const node of nodes) {
            const dist = Math.hypot(mx - node.dx, my - node.dy);
            if (dist < NODE_RADIUS + 5) {
                selectedNode = node.id;
                // Update the dropdown
                const select = document.getElementById('passenger-node');
                if (select) select.value = String(node.id);
                return;
            }
        }
        selectedNode = null;
    }

    // ===== Render Loop =====

    function startRenderLoop() {
        function loop() {
            render();
            animationId = requestAnimationFrame(loop);
        }
        loop();
    }

    function render() {
        if (!ctx || !canvas) return;
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Rescale on each frame (handles resize)
        scaleNodesToCanvas();

        drawEdges();
        drawBfsWave();
        drawHighlightRoute();
        drawNodes();
        drawCabs();
    }

    function drawEdges() {
        ctx.strokeStyle = COLORS.edge;
        ctx.lineWidth = 1.5;

        edges.forEach(([u, v]) => {
            const nU = nodes.find(n => n.id === u);
            const nV = nodes.find(n => n.id === v);
            if (!nU || !nV) return;

            ctx.beginPath();
            ctx.moveTo(nU.dx, nU.dy);
            ctx.lineTo(nV.dx, nV.dy);
            ctx.stroke();
        });
    }

    function drawNodes() {
        nodes.forEach(node => {
            const isSelected = node.id === selectedNode;

            // Node circle
            ctx.beginPath();
            ctx.arc(node.dx, node.dy, NODE_RADIUS, 0, Math.PI * 2);
            ctx.fillStyle = isSelected ? 'rgba(0,255,136,0.1)' : COLORS.nodeFill;
            ctx.fill();
            ctx.strokeStyle = isSelected ? COLORS.highlight : COLORS.nodeStroke;
            ctx.lineWidth = isSelected ? 2 : 1;
            ctx.stroke();

            // Glow for selected
            if (isSelected) {
                ctx.beginPath();
                ctx.arc(node.dx, node.dy, NODE_RADIUS + 4, 0, Math.PI * 2);
                ctx.strokeStyle = 'rgba(0,255,136,0.2)';
                ctx.lineWidth = 1;
                ctx.stroke();
            }

            // Node ID label
            ctx.fillStyle = isSelected ? COLORS.highlight : COLORS.nodeText;
            ctx.font = '500 10px "Inter"';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(node.id, node.dx, node.dy);
        });
    }

    function drawCabs() {
        cabs.forEach(cab => {
            const node = nodes.find(n => n.id === cab.current_node);
            if (!node) return;

            const color = COLORS[cab.state] || COLORS.IDLE;

            // Cab dot (offset slightly if multiple cabs at same node)
            const sameNodeCabs = cabs.filter(c => c.current_node === cab.current_node);
            const idx = sameNodeCabs.indexOf(cab);
            const offsetAngle = (idx / sameNodeCabs.length) * Math.PI * 2;
            const offsetDist = sameNodeCabs.length > 1 ? NODE_RADIUS + 10 : NODE_RADIUS + 8;
            const cx = node.dx + Math.cos(offsetAngle) * offsetDist;
            const cy = node.dy + Math.sin(offsetAngle) * offsetDist;

            // Glow
            ctx.beginPath();
            ctx.arc(cx, cy, CAB_RADIUS + 4, 0, Math.PI * 2);
            const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, CAB_RADIUS + 4);
            glow.addColorStop(0, color + '40');
            glow.addColorStop(1, 'transparent');
            ctx.fillStyle = glow;
            ctx.fill();

            // Cab circle
            ctx.beginPath();
            ctx.arc(cx, cy, CAB_RADIUS, 0, Math.PI * 2);
            ctx.fillStyle = color;
            ctx.fill();

            // Pulse for active cabs
            if (cab.state === 'DISPATCHED' || cab.state === 'EN_ROUTE') {
                const pulseR = CAB_RADIUS + 3 + Math.sin(Date.now() / 300) * 3;
                ctx.beginPath();
                ctx.arc(cx, cy, pulseR, 0, Math.PI * 2);
                ctx.strokeStyle = color + '60';
                ctx.lineWidth = 1;
                ctx.stroke();
            }

            // PID label
            ctx.fillStyle = '#fff';
            ctx.font = '600 7px "JetBrains Mono"';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(`P${cab.pid}`, cx, cy);
        });
    }

    // ===== BFS Wave Animation =====

    function triggerBfsWave(nodeId) {
        const node = nodes.find(n => n.id === nodeId);
        if (!node) return;

        bfsWaveCenter = { x: node.dx, y: node.dy };
        bfsWaveRadius = 0;
        bfsWaveActive = true;

        const expandWave = () => {
            if (!bfsWaveActive) return;
            bfsWaveRadius += 3;
            if (bfsWaveRadius > Math.max(canvas.width, canvas.height)) {
                bfsWaveActive = false;
            } else {
                requestAnimationFrame(expandWave);
            }
        };
        expandWave();
    }

    function drawBfsWave() {
        if (!bfsWaveActive || !bfsWaveCenter) return;

        // Draw multiple concentric rings
        for (let i = 0; i < 3; i++) {
            const r = bfsWaveRadius - i * 30;
            if (r <= 0) continue;

            ctx.beginPath();
            ctx.arc(bfsWaveCenter.x, bfsWaveCenter.y, r, 0, Math.PI * 2);
            const alpha = Math.max(0, 0.3 - (r / Math.max(canvas.width, canvas.height)) * 0.3);
            ctx.strokeStyle = `rgba(0,255,136,${alpha})`;
            ctx.lineWidth = 2;
            ctx.stroke();
        }
    }

    // ===== Route Highlight =====

    function showRoute(routeNodeIds) {
        highlightRoute = routeNodeIds || [];
        highlightRouteProgress = 0;

        if (highlightRoute.length > 1) {
            const animateRoute = () => {
                highlightRouteProgress += 0.02;
                if (highlightRouteProgress < 1) {
                    requestAnimationFrame(animateRoute);
                }
            };
            animateRoute();
        }
    }

    function drawHighlightRoute() {
        if (highlightRoute.length < 2) return;

        const progress = Math.min(highlightRouteProgress, 1);
        const totalSegments = highlightRoute.length - 1;
        const segmentsToDraw = Math.floor(progress * totalSegments) + 1;

        ctx.strokeStyle = COLORS.routePath;
        ctx.lineWidth = 3;
        ctx.setLineDash([6, 4]);
        ctx.shadowColor = COLORS.routePath;
        ctx.shadowBlur = 8;

        ctx.beginPath();
        for (let i = 0; i < Math.min(segmentsToDraw, totalSegments); i++) {
            const nA = nodes.find(n => n.id === highlightRoute[i]);
            const nB = nodes.find(n => n.id === highlightRoute[i + 1]);
            if (!nA || !nB) continue;

            if (i === 0) ctx.moveTo(nA.dx, nA.dy);
            ctx.lineTo(nB.dx, nB.dy);
        }
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.shadowBlur = 0;
    }

    /**
     * Reset all animations.
     */
    function clearAnimations() {
        bfsWaveActive = false;
        highlightRoute = [];
        highlightRouteProgress = 0;
        selectedNode = null;
    }

    // Public API
    return {
        init,
        setGraphData,
        setCabs,
        triggerBfsWave,
        showRoute,
        clearAnimations
    };
})();

document.addEventListener('DOMContentLoaded', () => {
    GraphViz.init();
});
