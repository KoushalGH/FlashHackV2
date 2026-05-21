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
    let hoveredNode = null;

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
        edgeHighlight: 'rgba(78,205,196,0.35)',
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
    let routeDotProgress = 0;
    let routeAnimationId = null;
    let activeRoutePid = null;
    let routeClearTimer = null;
    let selectedNode = null;
    let dispatchFlashPid = null;
    let dispatchFlashTime = 0;

    /**
     * Initialize the canvas and set up resize handling.
     */
    function init() {
        canvas = document.getElementById('city-canvas');
        if (!canvas) return;
        ctx = canvas.getContext('2d');

        resizeCanvas();
        window.addEventListener('resize', resizeCanvas);

        // Click detection and hover on canvas
        canvas.addEventListener('click', handleCanvasClick);
        canvas.addEventListener('mousemove', handleCanvasHover);
        canvas.addEventListener('mouseleave', () => { hoveredNode = null; canvas.style.cursor = 'default'; });

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
        syncRouteWithFleet(cabs);
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
                const select = document.getElementById('passenger-node');
                if (select) select.value = String(node.id);
                return;
            }
        }
        selectedNode = null;
    }

    /**
     * Handle hover on canvas — show node name tooltip.
     */
    function handleCanvasHover(e) {
        const rect = canvas.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;

        hoveredNode = null;
        canvas.style.cursor = 'default';
        for (const node of nodes) {
            const dist = Math.hypot(mx - node.dx, my - node.dy);
            if (dist < NODE_RADIUS + 8) {
                hoveredNode = node;
                canvas.style.cursor = 'pointer';
                break;
            }
        }
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
        drawRouteDot();
        drawNodes();
        drawCabs();
        drawDispatchFlash();
        drawTooltip();
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

    // ===== BFS Wave Animation (Enhanced with 5-ring gradient fade) =====

    function triggerBfsWave(nodeId) {
        const node = nodes.find(n => n.id === nodeId);
        if (!node) return;

        bfsWaveCenter = { x: node.dx, y: node.dy };
        bfsWaveRadius = 0;
        bfsWaveActive = true;

        const expandWave = () => {
            if (!bfsWaveActive) return;
            bfsWaveRadius += 2.5;
            if (bfsWaveRadius > Math.max(canvas.width, canvas.height) * 0.8) {
                bfsWaveActive = false;
            } else {
                requestAnimationFrame(expandWave);
            }
        };
        expandWave();
    }

    function drawBfsWave() {
        if (!bfsWaveActive || !bfsWaveCenter) return;

        // 5 concentric rings with gradient fade — looks like BFS expanding level-by-level
        for (let i = 0; i < 5; i++) {
            const r = bfsWaveRadius - i * 25;
            if (r <= 0) continue;

            const maxDim = Math.max(canvas.width, canvas.height);
            const alpha = Math.max(0, 0.35 - (r / maxDim) * 0.35) * (1 - i * 0.15);
            if (alpha <= 0) continue;

            // Ring stroke
            ctx.beginPath();
            ctx.arc(bfsWaveCenter.x, bfsWaveCenter.y, r, 0, Math.PI * 2);
            ctx.strokeStyle = `rgba(0,255,136,${alpha})`;
            ctx.lineWidth = 2.5 - i * 0.3;
            ctx.stroke();

            // Subtle fill for innermost ring
            if (i === 0 && r < 60) {
                ctx.beginPath();
                ctx.arc(bfsWaveCenter.x, bfsWaveCenter.y, r, 0, Math.PI * 2);
                ctx.fillStyle = `rgba(0,255,136,${alpha * 0.15})`;
                ctx.fill();
            }
        }

        // Highlight nodes that the BFS wave has reached
        nodes.forEach(node => {
            const dist = Math.hypot(node.dx - bfsWaveCenter.x, node.dy - bfsWaveCenter.y);
            if (dist < bfsWaveRadius && dist > bfsWaveRadius - 40) {
                ctx.beginPath();
                ctx.arc(node.dx, node.dy, NODE_RADIUS + 3, 0, Math.PI * 2);
                ctx.strokeStyle = 'rgba(0,255,136,0.4)';
                ctx.lineWidth = 1.5;
                ctx.stroke();
            }
        });
    }

    // ===== Route Highlight =====

    function cancelRouteAnimation() {
        if (routeAnimationId != null) {
            cancelAnimationFrame(routeAnimationId);
            routeAnimationId = null;
        }
    }

    function cancelRouteClearTimer() {
        if (routeClearTimer != null) {
            clearTimeout(routeClearTimer);
            routeClearTimer = null;
        }
    }

    function clearRoute() {
        cancelRouteAnimation();
        cancelRouteClearTimer();
        highlightRoute = [];
        highlightRouteProgress = 0;
        routeDotProgress = 0;
        activeRoutePid = null;
    }

    function clearRouteForCab(pid) {
        const p = Number(pid);
        if (activeRoutePid == null || Number(activeRoutePid) === p) {
            clearRoute();
        }
    }

    /** Hide route when no cabs are on a trip (works even if WebSocket missed IDLE events). */
    function syncRouteWithFleet(cabList) {
        if (!highlightRoute.length) return;
        const list = cabList || cabs;
        const hasActive = list.some(c =>
            c.state === 'DISPATCHED' || c.state === 'EN_ROUTE'
        );
        if (!hasActive) clearRoute();
    }

    function showRoute(routeNodeIds, pid, autoClearSecs) {
        clearRoute();
        activeRoutePid = pid != null ? Number(pid) : null;
        highlightRoute = routeNodeIds || [];
        highlightRouteProgress = 0;
        routeDotProgress = 0;

        if (highlightRoute.length > 1) {
            const animateRoute = () => {
                if (highlightRoute.length < 2) return;
                highlightRouteProgress += 0.025;
                routeDotProgress += 0.008;
                if (routeDotProgress > 1) routeDotProgress = 0;
                if (highlightRouteProgress < 1) {
                    routeAnimationId = requestAnimationFrame(animateRoute);
                } else {
                    const loopDot = () => {
                        if (highlightRoute.length < 2) return;
                        routeDotProgress += 0.008;
                        if (routeDotProgress > 1) routeDotProgress = 0;
                        routeAnimationId = requestAnimationFrame(loopDot);
                    };
                    routeAnimationId = requestAnimationFrame(loopDot);
                }
            };
            routeAnimationId = requestAnimationFrame(animateRoute);
        }

        // Fallback: clear route when auto-ride finishes (WebSocket may be disconnected)
        const secs = autoClearSecs != null ? Number(autoClearSecs) : 6;
        routeClearTimer = setTimeout(() => clearRoute(), secs * 1000 + 400);
    }

    function drawHighlightRoute() {
        if (highlightRoute.length < 2) return;

        const progress = Math.min(highlightRouteProgress, 1);
        const totalSegments = highlightRoute.length - 1;
        const segmentsToDraw = Math.floor(progress * totalSegments) + 1;

        // Glow under the route
        ctx.strokeStyle = 'rgba(78,205,196,0.12)';
        ctx.lineWidth = 10;
        ctx.setLineDash([]);
        ctx.beginPath();
        for (let i = 0; i < Math.min(segmentsToDraw, totalSegments); i++) {
            const nA = nodes.find(n => n.id === highlightRoute[i]);
            const nB = nodes.find(n => n.id === highlightRoute[i + 1]);
            if (!nA || !nB) continue;
            if (i === 0) ctx.moveTo(nA.dx, nA.dy);
            ctx.lineTo(nB.dx, nB.dy);
        }
        ctx.stroke();

        // Main route line
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

    /** Moving dot along the route path */
    function drawRouteDot() {
        if (highlightRoute.length < 2 || highlightRouteProgress < 0.3) return;

        const totalLen = highlightRoute.length - 1;
        const pos = routeDotProgress * totalLen;
        const segIdx = Math.floor(pos);
        const segFrac = pos - segIdx;

        if (segIdx >= totalLen) return;

        const nA = nodes.find(n => n.id === highlightRoute[segIdx]);
        const nB = nodes.find(n => n.id === highlightRoute[segIdx + 1]);
        if (!nA || !nB) return;

        const dx = nA.dx + (nB.dx - nA.dx) * segFrac;
        const dy = nA.dy + (nB.dy - nA.dy) * segFrac;

        // Glowing moving dot
        ctx.beginPath();
        ctx.arc(dx, dy, 5, 0, Math.PI * 2);
        ctx.fillStyle = '#fff';
        ctx.shadowColor = COLORS.routePath;
        ctx.shadowBlur = 12;
        ctx.fill();
        ctx.shadowBlur = 0;
    }

    /**
     * Reset all animations.
     */
    function clearAnimations() {
        bfsWaveActive = false;
        clearRoute();
        selectedNode = null;
        dispatchFlashPid = null;
    }

    /** Flash effect when a cab gets dispatched */
    function flashCab(pid) {
        dispatchFlashPid = pid;
        dispatchFlashTime = Date.now();
    }

    function drawDispatchFlash() {
        if (!dispatchFlashPid) return;
        const elapsed = Date.now() - dispatchFlashTime;
        if (elapsed > 800) { dispatchFlashPid = null; return; }

        const cab = cabs.find(c => c.pid === dispatchFlashPid);
        if (!cab) return;
        const node = nodes.find(n => n.id === cab.current_node);
        if (!node) return;

        const alpha = Math.max(0, 1 - elapsed / 800);
        const r = 20 + elapsed * 0.06;
        ctx.beginPath();
        ctx.arc(node.dx, node.dy, r, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(255,107,53,${alpha * 0.6})`;
        ctx.lineWidth = 2;
        ctx.stroke();
    }

    /** Tooltip showing node name on hover */
    function drawTooltip() {
        if (!hoveredNode) return;

        const name = hoveredNode.name || `Node ${hoveredNode.id}`;
        const text = `[${hoveredNode.id}] ${name}`;

        ctx.font = '500 11px "Inter"';
        const metrics = ctx.measureText(text);
        const tw = metrics.width + 16;
        const th = 24;
        let tx = hoveredNode.dx - tw / 2;
        let ty = hoveredNode.dy - NODE_RADIUS - th - 8;

        // Keep tooltip on screen
        tx = Math.max(4, Math.min(tx, canvas.width - tw - 4));
        ty = Math.max(4, ty);

        // Background
        ctx.fillStyle = 'rgba(13,13,20,0.92)';
        ctx.strokeStyle = 'rgba(255,255,255,0.1)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(tx, ty, tw, th, 4);
        ctx.fill();
        ctx.stroke();

        // Text
        ctx.fillStyle = '#e8e8ed';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, tx + tw / 2, ty + th / 2);
    }

    // Public API
    return {
        init,
        setGraphData,
        setCabs,
        triggerBfsWave,
        showRoute,
        clearRoute,
        clearRouteForCab,
        syncRouteWithFleet,
        clearAnimations,
        flashCab
    };
})();

document.addEventListener('DOMContentLoaded', () => {
    GraphViz.init();
});
