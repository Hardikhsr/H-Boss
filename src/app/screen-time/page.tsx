"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import {
  Monitor, Loader2, Clock, TrendingUp, AlertTriangle,
  Users, BarChart3, Eye, ChevronRight, Timer, Zap,
  Coffee, Activity
} from "lucide-react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, BarChart, Bar, Cell, PieChart, Pie,
  Legend
} from "recharts";

const CATEGORY_COLORS: Record<string, string> = {
  Productive: "#10b981",
  Unproductive: "#ef4444",
  Browsing: "#3b82f6",
  Neutral: "#6b7280",
  System: "#8b5cf6",
  Idle: "#374151",
};

export default function ScreenTimePage() {
  const [appUsage, setAppUsage] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [idleStats, setIdleStats] = useState<any>({ today: {}, weeklyTrend: [] });
  const [employees, setEmployees] = useState<any[]>([]);
  const [topRisks, setTopRisks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"overview" | "apps" | "employees">("overview");

  const safe = async (url: string, fallback: any = []) => {
    try { const r = await fetch(url); if (!r.ok) return fallback; return await r.json(); } catch { return fallback; }
  };

  const fetchAll = useCallback(async () => {
    const [apps, cats, idle, emps, risks] = await Promise.all([
      safe("/api/app-usage"),
      safe("/api/categories"),
      safe("/api/idle-stats", { today: {}, weeklyTrend: [] }),
      safe("/api/employees"),
      safe("/api/top-risks"),
    ]);
    setAppUsage(Array.isArray(apps) ? apps : []);
    setCategories(Array.isArray(cats) ? cats : []);
    setIdleStats(idle || { today: {}, weeklyTrend: [] });
    setEmployees(Array.isArray(emps) ? emps : []);
    setTopRisks(Array.isArray(risks) ? risks : []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); const i = setInterval(fetchAll, 30000); return () => clearInterval(i); }, [fetchAll]);

  const todayStats = idleStats.today || {};
  const weeklyTrend = Array.isArray(idleStats.weeklyTrend) ? idleStats.weeklyTrend : [];

  const totalTime = useMemo(() => todayStats.total || 0, [todayStats]);
  const prodPct = useMemo(() => totalTime > 0 ? Math.round((todayStats.productive || 0) / totalTime * 100) : 0, [todayStats, totalTime]);
  const idlePct = useMemo(() => totalTime > 0 ? Math.round((todayStats.idle || 0) / totalTime * 100) : 0, [todayStats, totalTime]);

  const appsByCategory = useMemo(() => {
    const grouped: Record<string, { apps: any[]; total: number }> = {};
    appUsage.forEach(a => {
      const cat = a.category || "Neutral";
      if (!grouped[cat]) grouped[cat] = { apps: [], total: 0 };
      grouped[cat].apps.push(a);
      grouped[cat].total += a.sessions || a.percentage || 0;
    });
    return Object.entries(grouped)
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => b.total - a.total);
  }, [appUsage]);

  const employeeScreenTime = useMemo(() => {
    return topRisks.map(r => ({
      hostname: r.hostname,
      username: r.username,
      totalActivity: r.totalActivity || 0,
      productive: r.totalActivity - (r.unproductiveCount || 0),
      unproductive: r.unproductiveCount || 0,
      prodPct: r.totalActivity > 0 ? Math.round(((r.totalActivity - r.unproductiveCount) / r.totalActivity) * 100) : 0,
    })).sort((a, b) => b.totalActivity - a.totalActivity);
  }, [topRisks]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[600px] space-y-6">
        <Loader2 className="w-16 h-16 animate-spin text-[#10b981]" />
        <p className="text-[10px] font-black text-gray-600 uppercase tracking-[0.5em]">Calculating Screen Time...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-700 pb-20">
      {/* Header */}
      <div className="flex justify-between items-end border-b border-white/5 pb-8">
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <div className="w-1.5 h-1.5 bg-[#06b6d4]" />
            <span className="text-[10px] font-black text-[#06b6d4] uppercase tracking-[0.4em]">Screen Time Analytics</span>
          </div>
          <h1 className="text-5xl font-black tracking-tighter text-white uppercase italic">Screen<span className="text-[#06b6d4]">Time</span></h1>
        </div>
        <div className="flex gap-1">
          {(["overview", "apps", "employees"] as const).map(v => (
            <button key={v} onClick={() => setView(v)}
              className={`px-5 py-3 text-[10px] font-black uppercase tracking-wider border transition-all ${view === v ? "border-[#06b6d4]/50 bg-[#06b6d4]/10 text-[#06b6d4]" : "border-white/10 text-gray-600 hover:text-white"}`}>
              {v}
            </button>
          ))}
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-1">
        <TimeStat label="Total Events" value={totalTime} color="#06b6d4" icon={Monitor} />
        <TimeStat label="Productive" value={`${prodPct}%`} color="#10b981" icon={TrendingUp} />
        <TimeStat label="Unproductive" value={`${totalTime > 0 ? Math.round((todayStats.unproductive || 0) / totalTime * 100) : 0}%`} color="#ef4444" icon={AlertTriangle} />
        <TimeStat label="Idle Time" value={`${idlePct}%`} color="#6b7280" icon={Coffee} />
        <TimeStat label="Active Users" value={employees.filter(e => e.status === "Active").length} color="#8b5cf6" icon={Users} />
      </div>

      {view === "overview" && (
        <>
          {/* Time Distribution */}
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-1">
            {/* Category Pie */}
            <div className="xl:col-span-4 p-6 border border-white/5 bg-white/[0.01]">
              <h3 className="text-[10px] font-black text-gray-600 uppercase tracking-[0.3em] mb-4">Time by Category</h3>
              <div className="h-[220px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={categories} cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={2} dataKey="value">
                      {categories.map((entry, i) => (
                        <Cell key={i} fill={CATEGORY_COLORS[entry.name] || "#6b7280"} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ background: "#0a0a0b", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 0, fontSize: 11 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="grid grid-cols-2 gap-2 mt-3">
                {categories.map((c, i) => (
                  <div key={i} className="flex items-center gap-2 p-2 bg-white/[0.02] border border-white/5">
                    <div className="w-2 h-2 shrink-0" style={{ background: CATEGORY_COLORS[c.name] || "#6b7280" }} />
                    <span className="text-[8px] font-black text-gray-500 uppercase tracking-wider truncate">{c.name}</span>
                    <span className="text-[9px] font-black ml-auto" style={{ color: CATEGORY_COLORS[c.name] || "#6b7280" }}>{c.value}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Weekly Trend */}
            <div className="xl:col-span-8 p-6 border border-white/5 bg-white/[0.01]">
              <h3 className="text-[10px] font-black text-gray-600 uppercase tracking-[0.3em] mb-4">Weekly Screen Time Trend</h3>
              <div className="h-[320px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={weeklyTrend}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" />
                    <XAxis dataKey="day" tick={{ fontSize: 9, fill: "#444", fontWeight: 900 }} tickFormatter={(v) => v?.slice(5)} />
                    <YAxis tick={{ fontSize: 9, fill: "#444" }} label={{ value: "Hours", angle: -90, position: "left", fontSize: 9, fill: "#666" }} />
                    <Tooltip contentStyle={{ background: "#0a0a0b", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 0, fontSize: 11, fontWeight: 900 }} />
                    <Legend wrapperStyle={{ fontSize: 9, fontWeight: 900 }} />
                    <Area type="monotone" dataKey="totalHours" name="Total" stroke="#06b6d4" fill="#06b6d4" fillOpacity={0.05} strokeWidth={1} strokeDasharray="5 5" />
                    <Area type="monotone" dataKey="productiveHours" name="Productive" stroke="#10b981" fill="#10b981" fillOpacity={0.15} strokeWidth={2} />
                    <Area type="monotone" dataKey="unproductiveHours" name="Unproductive" stroke="#ef4444" fill="#ef4444" fillOpacity={0.1} strokeWidth={1.5} />
                    <Area type="monotone" dataKey="browsingHours" name="Browsing" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.05} strokeWidth={1} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Top Apps Quick */}
          <div className="border border-white/5 bg-white/[0.01]">
            <div className="p-5 bg-black/40 border-b border-white/5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Timer className="w-4 h-4 text-[#06b6d4]/50" />
                <span className="text-[10px] font-black text-white uppercase tracking-widest">Top Applications by Time</span>
              </div>
              <button onClick={() => setView("apps")} className="text-[8px] font-black text-gray-600 uppercase tracking-widest hover:text-[#06b6d4] transition-colors">
                View All →
              </button>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-px bg-white/5">
              {appUsage.slice(0, 12).map((app, i) => (
                <div key={i} className="p-4 bg-[#0a0a0b] hover:bg-white/[0.02] transition-colors">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-1.5 h-1.5" style={{ background: CATEGORY_COLORS[app.category] || "#6b7280" }} />
                    <span className="text-[9px] font-black text-white uppercase truncate">{app.app}</span>
                  </div>
                  <p className="text-2xl font-black tracking-tighter" style={{ color: CATEGORY_COLORS[app.category] || "#6b7280" }}>
                    {app.percentage}%
                  </p>
                  <p className="text-[8px] text-gray-700 font-bold uppercase mt-1">{app.sessions || 0} sessions</p>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {view === "apps" && (
        <>
          {/* Grouped by Category */}
          {appsByCategory.map((cat) => (
            <div key={cat.name} className="border border-white/5 bg-white/[0.01]">
              <div className="p-5 bg-black/40 border-b border-white/5 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-3 h-3" style={{ background: CATEGORY_COLORS[cat.name] || "#6b7280" }} />
                  <span className="text-[10px] font-black text-white uppercase tracking-widest">{cat.name}</span>
                </div>
                <span className="text-[9px] font-black text-gray-600">{cat.apps.length} apps</span>
              </div>
              <div className="divide-y divide-white/5">
                {cat.apps.map((app, i) => (
                  <div key={i} className="p-4 hover:bg-white/[0.02] transition-colors relative overflow-hidden">
                    <div className="absolute inset-y-0 left-0 transition-all"
                      style={{
                        width: `${app.percentage || 0}%`,
                        background: `${CATEGORY_COLORS[cat.name] || "#6b7280"}08`
                      }} />
                    <div className="relative flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <span className="text-[10px] font-black text-gray-700 w-5">{i + 1}</span>
                        <p className="text-[11px] font-black text-white uppercase">{app.app}</p>
                      </div>
                      <div className="flex items-center gap-4">
                        <span className="text-[10px] font-black" style={{ color: CATEGORY_COLORS[cat.name] || "#6b7280" }}>{app.percentage}%</span>
                        <span className="text-[9px] font-black text-gray-600">{app.sessions || 0} sessions</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
          {appsByCategory.length === 0 && (
            <div className="py-16 text-center text-gray-700 text-[10px] font-black uppercase tracking-widest border border-white/5">No app usage data</div>
          )}
        </>
      )}

      {view === "employees" && (
        <div className="border border-white/5 bg-white/[0.01]">
          <div className="p-5 bg-black/40 border-b border-white/5 flex items-center gap-3">
            <Users className="w-4 h-4 text-[#06b6d4]/50" />
            <span className="text-[10px] font-black text-white uppercase tracking-widest">Screen Time by Employee</span>
          </div>
          <div className="divide-y divide-white/5">
            {employeeScreenTime.map((emp, i) => (
              <Link href={`/employees/${encodeURIComponent(emp.hostname)}`} key={i}
                className="flex items-center justify-between p-4 hover:bg-white/[0.02] transition-all group">
                <div className="flex items-center gap-4">
                  <span className="text-[10px] font-black text-gray-700 w-5">{i + 1}</span>
                  <div>
                    <p className="text-[11px] font-black text-white uppercase group-hover:text-[#06b6d4] transition-colors">{emp.hostname}</p>
                    <p className="text-[9px] text-gray-600">{emp.username}</p>
                  </div>
                </div>
                <div className="flex items-center gap-6">
                  <div className="text-right">
                    <p className="text-[10px] font-black text-[#06b6d4]">{emp.totalActivity}</p>
                    <p className="text-[8px] text-gray-700 uppercase">Events</p>
                  </div>
                  <div className="w-32 h-2 bg-white/5 flex overflow-hidden">
                    <div className="h-full bg-[#10b981]" style={{ width: `${emp.prodPct}%` }} />
                    <div className="h-full bg-[#ef4444]" style={{ width: `${100 - emp.prodPct}%` }} />
                  </div>
                  <div className="text-right w-12">
                    <p className="text-[10px] font-black" style={{ color: emp.prodPct >= 60 ? "#10b981" : emp.prodPct >= 30 ? "#f59e0b" : "#ef4444" }}>{emp.prodPct}%</p>
                    <p className="text-[8px] text-gray-700 uppercase">Prod</p>
                  </div>
                  <ChevronRight className="w-3 h-3 text-gray-800 group-hover:text-[#06b6d4] transition-colors" />
                </div>
              </Link>
            ))}
            {employeeScreenTime.length === 0 && (
              <div className="py-16 text-center text-gray-700 text-[10px] font-black uppercase tracking-widest">No employee data</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function TimeStat({ label, value, color, icon: Icon }: any) {
  return (
    <div className="p-6 border border-white/5 bg-white/[0.01] hover:bg-white/[0.03] hover:border-white/10 transition-all duration-300 hover:-translate-y-1 group relative overflow-hidden">
      <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
        <Icon className="w-12 h-12" style={{ color }} />
      </div>
      <p className="text-[9px] font-black text-gray-500 uppercase tracking-[0.4em] mb-4">{label}</p>
      <h3 className="text-4xl font-black tracking-tighter opacity-90 group-hover:opacity-100" style={{ color, textShadow: `0 0 15px ${color}40` }}>{value}</h3>
      <div className="absolute bottom-0 left-0 h-0.5 transition-all duration-300 group-hover:w-full w-0" style={{ background: color }} />
    </div>
  );
}
