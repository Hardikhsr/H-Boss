const { spawn } = require("child_process");
const path = require("path");
const net = require("net");

const ROOT = __dirname;
const BACKEND_PORT = parseInt(process.env.BACKEND_PORT, 10) || 4000;
const DASHBOARD_PORT = parseInt(process.env.PORT, 10) || 3000;

let backendProc = null;
let dashboardProc = null;
let backendRestartCount = 0;
let healthCheckInterval = null;

function log(tag, msg) {
    const ts = new Date().toISOString();
    console.log(`[${ts}] [${tag}] ${msg}`);
}

function waitForPort(port, timeout = 15000) {
    return new Promise((resolve, reject) => {
        const start = Date.now();
        const check = () => {
            const socket = new net.Socket();
            socket.setTimeout(500);
            socket.on("connect", () => { socket.destroy(); resolve(); });
            socket.on("error", () => { socket.destroy(); retry(); });
            socket.on("timeout", () => { socket.destroy(); retry(); });
            socket.connect(port, "127.0.0.1");
        };
        const retry = () => {
            if (Date.now() - start > timeout) {
                reject(new Error(`Port ${port} did not open within ${timeout}ms`));
            } else {
                setTimeout(check, 500);
            }
        };
        check();
    });
}

function checkPort(port) {
    return new Promise((resolve) => {
        const socket = new net.Socket();
        socket.setTimeout(2000);
        socket.on("connect", () => { socket.destroy(); resolve(true); });
        socket.on("error", () => { socket.destroy(); resolve(false); });
        socket.on("timeout", () => { socket.destroy(); resolve(false); });
        socket.connect(port, "127.0.0.1");
    });
}

function getRestartDelay() {
    // Exponential backoff: 3s, 6s, 12s, 24s, capped at 30s
    const delay = Math.min(3000 * Math.pow(2, backendRestartCount), 30000);
    return delay;
}

function startBackend() {
    log("BACKEND", `Starting API server on port ${BACKEND_PORT}...`);
    backendProc = spawn("node", ["backend.js"], {
        cwd: ROOT,
        stdio: ["ignore", "pipe", "pipe"],
        env: { ...process.env, BACKEND_PORT: String(BACKEND_PORT) }
    });

    backendProc.stdout.on("data", (d) => {
        d.toString().split("\n").filter(Boolean).forEach(line => {
            log("BACKEND", line.trim());
        });
    });

    backendProc.stderr.on("data", (d) => {
        d.toString().split("\n").filter(Boolean).forEach(line => {
            log("BACKEND", `⚠ ${line.trim()}`);
        });
    });

    backendProc.on("exit", (code) => {
        backendProc = null;
        const delay = getRestartDelay();
        backendRestartCount++;
        log("BACKEND", `❌ Backend exited with code ${code}. Restarting in ${delay / 1000}s... (attempt #${backendRestartCount})`);
        setTimeout(() => {
            log("BACKEND", "Restarting backend...");
            startBackend();
        }, delay);
    });
}

function startDashboard() {
    log("DASHBOARD", `Starting Next.js dashboard on port ${DASHBOARD_PORT}...`);
    dashboardProc = spawn("npx", ["next", "start", "-H", "0.0.0.0", "-p", String(DASHBOARD_PORT)], {
        cwd: ROOT,
        stdio: ["ignore", "pipe", "pipe"],
        shell: true,
        env: { ...process.env }
    });

    dashboardProc.stdout.on("data", (d) => {
        d.toString().split("\n").filter(Boolean).forEach(line => {
            log("DASHBOARD", line.trim());
        });
    });

    dashboardProc.stderr.on("data", (d) => {
        d.toString().split("\n").filter(Boolean).forEach(line => {
            // Suppress harmless proxy/socket/deprecation noise
            if (line.includes("Failed to proxy") || line.includes("ECONNRESET")) return;
            if (line.includes("socket hang up") || line.includes("ignore-listed frames")) return;
            if (line.includes("DEP0060") || line.includes("DEP0190") || line.includes("util._extend")) return;
            if (line.includes("trace-deprecation")) return;
            log("DASHBOARD", `⚠ ${line.trim()}`);
        });
    });

    dashboardProc.on("exit", (code) => {
        log("DASHBOARD", `Dashboard exited with code ${code}. Restarting in 3s...`);
        dashboardProc = null;
        setTimeout(() => {
            log("DASHBOARD", "Restarting dashboard...");
            startDashboard();
        }, 3000);
    });
}

function startHealthMonitor() {
    // Check backend health every 30 seconds
    healthCheckInterval = setInterval(async () => {
        const alive = await checkPort(BACKEND_PORT);
        if (!alive && !backendProc) {
            log("HEALTH", `⚠ Backend not responding on port ${BACKEND_PORT}. Triggering restart...`);
            backendRestartCount = 0; // Reset backoff on health-triggered restart
            startBackend();
        } else if (alive && backendRestartCount > 0) {
            // Backend recovered — reset restart counter
            log("HEALTH", "✅ Backend is healthy. Resetting restart counter.");
            backendRestartCount = 0;
        }
    }, 30000);
}

async function main() {
    log("BOOT", "═══════════════════════════════════════");
    log("BOOT", "  HBOSE CORE SYSTEM — UNIFIED LAUNCHER");
    log("BOOT", "═══════════════════════════════════════");
    log("BOOT", `  Backend port:   ${BACKEND_PORT}`);
    log("BOOT", `  Dashboard port: ${DASHBOARD_PORT}`);

    // 1. Start Backend FIRST
    startBackend();

    // 2. Wait for backend to be ready
    try {
        await waitForPort(BACKEND_PORT, 20000);
        log("BACKEND", `✅ API server is ONLINE (port ${BACKEND_PORT})`);
    } catch (e) {
        log("BACKEND", "⚠ Backend did not start in time, launching dashboard anyway...");
    }

    // 3. Start Dashboard AFTER backend is confirmed ready
    startDashboard();

    // 4. Start health monitoring
    startHealthMonitor();

    log("BOOT", "");
    log("BOOT", `  Dashboard:  http://localhost:${DASHBOARD_PORT}`);
    log("BOOT", `  Backend:    http://localhost:${BACKEND_PORT}`);
    log("BOOT", "  Health:     http://localhost:" + DASHBOARD_PORT + "/api/health");
    log("BOOT", "  Press Ctrl+C to stop all services");
    log("BOOT", "");

    // Graceful shutdown
    const shutdown = () => {
        log("SHUTDOWN", "Stopping all services...");
        if (healthCheckInterval) clearInterval(healthCheckInterval);
        if (backendProc) { backendProc.removeAllListeners("exit"); backendProc.kill(); }
        if (dashboardProc) { dashboardProc.removeAllListeners("exit"); dashboardProc.kill(); }
        process.exit(0);
    };

    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
}

main();
