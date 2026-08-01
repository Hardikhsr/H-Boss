"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import {
  Brain, Activity, TrendingUp, Users, Loader2, Clock,
  BarChart3, AlertTriangle, Target, Zap, ChevronRight,
  ArrowUpRight, ArrowDownRight, Eye, Filter
} from "lucide-react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, BarChart, Bar, Cell, ScatterChart,
  Scatter, ZAxis, LineChart, Line, Legend
} from "recharts";

const CATEGORY_COLORS: Record<string, string> = {
  Productive: "#10b981",
  Unproductive: "#ef4444",
  Browsing: "#3b82f6",
  Neutral: "#6b7280",
  System: "#8b5cf6",
};

export default function BehaviorAnalyticsPage() {
  const [heatmap, setHeatmap] = useState<any[]>([]);
  const [appUsage, setAppUsage] = useState<any[]>([]);
  const [idleStats, setIdleStats] = useState<any>({ today: {}, weeklyTrend: [] });
  const [topRisks, setTopRisks] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [prodData, setProdData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"patterns" | "anomalies" | "trends">("patterns");

  const safe = async (url: string, fallback: any = []) => {
    try { const r = await fetch(url); if (!r.ok) return fallback; return await r.json(); } catch { return fallback; }
  };

  const fetchAll = useCallback(async () => {
    const [heat, apps, idle, risks, emps, prod] = await Promise.all([
      safe("/api/heatmap-global"),
      safe("/api/app-usage"),
      safe("/api/idle-stats", { today: {}, weeklyTrend: [] }),
      safe("/api/top-risks"),
      safe("/api/employees"),
      safe("/api/productivity"),
    ]);
    setHeatmap(Array.isArray(heat) ? heat : []);
    setAppUsage(Array.isArray(apps) ? apps.slice(0, 15) : []);
    setIdleStats(idle || { today: {}, weeklyTrend: [] });
    setTopRisks(Array.isArray(risks) ? risks : []);
    setEmployees(Array.isArray(emps) ? emps : []);
    setProdData(Array.isArray(prod) ? prod : []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); const i = setInterval(fetchAll, 30000); return () => clearInterval(i); }, [fetchAll]);

  const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const HOURS = Array.from({ length: 24 }, (_, i) => i);

  const heatmapGrid = useMemo(() => {
    const grid: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0));
    heatmap.forEach(h => { if (h.dayOfWeek >= 0 && h.dayOfWeek < 7 && h.hour >= 0 && h.hour < 24) grid[h.dayOfWeek][h.hour] = h.count; });
    return grid;
  }, [heatmap]);

  const maxHeatVal = useMemo(() => Math.max(1, ...heatmap.map(h => h.count || 0)), [heatmap]);

  const behaviorScatter = useMemo(() => {
    return topRisks.map(r => ({
      name: r.hostname,
      productivity: r.totalActivity > 0 ? Math.round(((r.totalActivity - r.unproductiveCount) / r.totalActivity) * 100) : 50,
      risk: r.riskScore * 100,
      alerts: r.alertCount,
    }));
  }, [topRisks]);

  const todayStats = idleStats.today || {};
  const weeklyTrend = Array.isArray(idleStats.weeklyTrend) ? idleStats.weeklyTrend : [];

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[600px] space-y-6">
        <Loader2 className="w-16 h-16 animate-spin text-[#10b981]" />
        <p className="text-[10px] font-black text-gray-600 uppercase tracking-[0.5em]">Analyzing Behavioral Patterns...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-700 pb-20">
      {/* Header */}
      <div className="flex justify-between items-end border-b border-white/5 pb-8">
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <div className="w-1.5 h-1.5 bg-[#8b5cf6]" />
            <span className="text-[10px] font-black text-[#8b5cf6] uppercase tracking-[0.4em]">Advanced Behavior Analytics</span>
          </div>
          <h1 className="text-5xl font-black tracking-tighter text-white uppercase italic">Behavior<span className="text-[#8b5cf6]">Intel</span></h1>
        </div>
        <div className="flex gap-1">
          {(["patterns", "anomalies", "trends"] as const).map(v => (
            <button key={v} onClick={() => setView(v)}
              className={`px-5 py-3 text-[10px] font-black uppercase tracking-wider border transition-all ${view === v ? "border-[#8b5cf6]/50 bg-[#8b5cf6]/10 text-[#8b5cf6]" : "border-white/10 text-gray-600 hover:text-white"}`}>
              {v}
            </button>
          ))}
        </div>
      </div>

      {/* Today's Behavior Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-5 gap-1">
        <BehaviorStat label="Productive" value={todayStats.productive || 0} total={todayStats.total || 1} color="#10b981" icon={TrendingUp} />
        <BehaviorStat label="Unproductive" value={todayStats.unproductive || 0} total={todayStats.total || 1} color="#ef4444" icon={AlertTriangle} />
        <BehaviorStat label="Browsing" value={todayStats.browsing || 0} total={todayStats.total || 1} color="#3b82f6" icon={Eye} />
        <BehaviorStat label="Idle Time" value={todayStats.idle || 0} total={todayStats.total || 1} color="#6b7280" icon={Clock} />
        <BehaviorStat label="Total Events" value={todayStats.total || 0} total={1} color="#8b5cf6" icon={Activity} isCount />
      </div>

      {view === "patterns" && (
        <>
          {/* Activity Heatmap */}
          <div className="p-6 border border-white/5 bg-white/[0.01]">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-[10px] font-black text-gray-600 uppercase tracking-[0.3em]">Global Activity Heatmap — Day × Hour</h3>
              <span className="text-[8px] font-black text-gray-700 uppercase tracking-widest">Last 30 Days</span>
            </div>
            <div className="overflow-x-auto">
              <div className="min-w-[800px]">
                {/* Hour labels */}
                <div className="flex mb-1 pl-12">
                  {HOURS.map(h => (
                    <div key={h} className="flex-1 text-center text-[7px] font-black text-gray-700">{h.toString().padStart(2, "0")}</div>
                  ))}
                </div>
                {/* Grid rows */}
                {DAYS.map((day, dayIdx) => (
                  <div key={day} className="flex items-center mb-0.5">
                    <span className="w-12 text-[9px] font-black text-gray-600 uppercase">{day}</span>
                    <div className="flex flex-1 gap-0.5">
                      {HOURS.map(hour => {
                        const val = heatmapGrid[dayIdx]?.[hour] || 0;
                        const intensity = val / maxHeatVal;
                        return (
                          <div key={hour} className="flex-1 h-5 transition-all hover:scale-110 cursor-pointer relative group"
                            style={{
                              background: val === 0 ? "rgba(255,255,255,0.02)" : `rgba(139, 92, 246, ${0.1 + intensity * 0.8})`,
                            }}
                            title={`${day} ${hour}:00 — ${val} events`}>
                            <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-black/90 border border-white/10 px-2 py-1 text-[8px] font-black text-white whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                              {val} events
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
                {/* Intensity legend */}
                <div className="flex items-center justify-end gap-2 mt-4">
                  <span className="text-[8px] font-black text-gray-700 uppercase">Less</span>
                  {[0, 0.2, 0.4, 0.6, 0.8, 1].map(i => (
                    <div key={i} className="w-4 h-4" style={{ background: i === 0 ? "rgba(255,255,255,0.02)" : `rgba(139, 92, 246, ${0.1 + i * 0.8})` }} />
                  ))}
                  <span className="text-[8px] font-black text-gray-700 uppercase">More</span>
                </div>
              </div>
            </div>
          </div>

          {/* App Breakdown */}
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-1">
            <div className="xl:col-span-7 p-6 border border-white/5 bg-white/[0.01]">
              <h3 className="text-[10px] font-black text-gray-600 uppercase tracking-[0.3em] mb-4">Application Usage Distribution</h3>
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={appUsage} layout="vertical" margin={{ left: 100 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 9, fill: "#444" }} />
                    <YAxis dataKey="app" type="category" tick={{ fontSize: 8, fill: "#666", fontWeight: 900 }} width={100} />
                    <Tooltip contentStyle={{ background: "#0a0a0b", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 0, fontSize: 11 }} />
                    <Bar dataKey="sessions" fill="#8b5cf6" fillOpacity={0.6}>
                      {appUsage.map((entry, i) => (
                        <Cell key={i} fill={CATEGORY_COLORS[entry.category] || "#8b5cf6"} fillOpacity={0.6} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Weekly Trend */}
            <div className="xl:col-span-5 p-6 border border-white/5 bg-white/[0.01]">
              <h3 className="text-[10px] font-black text-gray-600 uppercase tracking-[0.3em] mb-4">Weekly Productivity Trend</h3>
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={weeklyTrend}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" />
                    <XAxis dataKey="day" tick={{ fontSize: 9, fill: "#444", fontWeight: 900 }} tickFormatter={(v) => v?.slice(5)} />
                    <YAxis tick={{ fontSize: 9, fill: "#444" }} />
                    <Tooltip contentStyle={{ background: "#0a0a0b", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 0, fontSize: 11 }} />
                    <Area type="monotone" dataKey="productiveHours" name="Productive" stroke="#10b981" fill="#10b981" fillOpacity={0.15} strokeWidth={2} />
                    <Area type="monotone" dataKey="unproductiveHours" name="Unproductive" stroke="#ef4444" fill="#ef4444" fillOpacity={0.1} strokeWidth={1} />
                    <Area type="monotone" dataKey="browsingHours" name="Browsing" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.05} strokeWidth={1} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </>
      )}

      {view === "anomalies" && (
        <>
          {/* Behavior Scatter */}
          <div className="p-6 border border-white/5 bg-white/[0.01]">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-[10px] font-black text-gray-600 uppercase tracking-[0.3em]">Productivity vs Risk — Anomaly Detection</h3>
              <span className="text-[8px] font-black text-amber-500/50 uppercase tracking-widest">⚠ Outliers indicate anomalous behavior</span>
            </div>
            <div className="h-[350px]">
              <ResponsiveContainer width="100%" height="100%">
                <ScatterChart margin={{ bottom: 20, right: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" />
                  <XAxis type="number" dataKey="productivity" name="Productivity %" tick={{ fontSize: 9, fill: "#444", fontWeight: 900 }}
                    label={{ value: "Productivity %", position: "bottom", fontSize: 9, fill: "#666", fontWeight: 900 }} />
                  <YAxis type="number" dataKey="risk" name="Risk Score" tick={{ fontSize: 9, fill: "#444" }}
                    label={{ value: "Risk Score", angle: -90, position: "left", fontSize: 9, fill: "#666", fontWeight: 900 }} />
                  <ZAxis type="number" dataKey="alerts" range={[40, 400]} />
                  <Tooltip contentStyle={{ background: "#0a0a0b", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 0, fontSize: 11 }} />
                  <Scatter data={behaviorScatter} fill="#8b5cf6" fillOpacity={0.7}>
                    {behaviorScatter.map((entry, i) => (
                      <Cell key={i} fill={entry.risk > 50 ? "#ef4444" : entry.risk > 20 ? "#f59e0b" : "#10b981"} />
                    ))}
                  </Scatter>
                </ScatterChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Anomaly Users List */}
          <div className="border border-white/5 bg-white/[0.01]">
            <div className="p-5 bg-black/40 border-b border-white/5 flex items-center gap-3">
              <Zap className="w-4 h-4 text-amber-500/50" />
              <span className="text-[10px] font-black text-white uppercase tracking-widest">Behavioral Anomalies</span>
            </div>
            <div className="divide-y divide-white/5">
              {topRisks.slice(0, 10).map((user, i) => {
                const prodRate = user.totalActivity > 0 ? Math.round(((user.totalActivity - user.unproductiveCount) / user.totalActivity) * 100) : 0;
                const isAnomaly = user.riskScore > 0.3 || prodRate < 30;
                return (
                  <Link href={`/employees/${encodeURIComponent(user.hostname)}`} key={i}
                    className={`flex items-center justify-between p-4 hover:bg-white/[0.02] transition-all group ${isAnomaly ? "border-l-2 border-amber-500" : ""}`}>
                    <div className="flex items-center gap-4">
                      <div className={`w-8 h-8 flex items-center justify-center border ${isAnomaly ? "border-amber-500/30 bg-amber-500/10" : "border-white/10 bg-white/[0.02]"}`}>
                        {isAnomaly ? <AlertTriangle className="w-3 h-3 text-amber-500" /> : <Activity className="w-3 h-3 text-gray-600" />}
                      </div>
                      <div>
                        <p className="text-[11px] font-black text-white uppercase">{user.hostname}</p>
                        <p className="text-[9px] text-gray-600">{user.username}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-6">
                      <div className="text-right">
                        <p className="text-[10px] font-black" style={{ color: prodRate >= 60 ? "#10b981" : prodRate >= 30 ? "#f59e0b" : "#ef4444" }}>{prodRate}%</p>
                        <p className="text-[8px] text-gray-700 uppercase">Productive</p>
                      </div>
                      <div className="text-right">
                        <p className="text-[10px] font-black" style={{ color: user.riskScore > 0.5 ? "#ef4444" : user.riskScore > 0.2 ? "#f59e0b" : "#10b981" }}>{(user.riskScore * 100).toFixed(0)}</p>
                        <p className="text-[8px] text-gray-700 uppercase">Risk</p>
                      </div>
                      <div className="text-right">
                        <p className="text-[10px] font-black text-red-400">{user.alertCount}</p>
                        <p className="text-[8px] text-gray-700 uppercase">Alerts</p>
                      </div>
                      <ChevronRight className="w-3 h-3 text-gray-800 group-hover:text-white transition-colors" />
                    </div>
                  </Link>
                );
              })}
              {topRisks.length === 0 && (
                <div className="py-16 text-center text-gray-700 text-[10px] font-black uppercase tracking-widest">No behavioral data</div>
              )}
            </div>
          </div>
        </>
      )}

      {view === "trends" && (
        <>
          {/* Productivity Over Time */}
          <div className="p-6 border border-white/5 bg-white/[0.01]">
            <h3 className="text-[10px] font-black text-gray-600 uppercase tracking-[0.3em] mb-4">Productivity Trend — Daily Breakdown</h3>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={weeklyTrend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" />
                  <XAxis dataKey="day" tick={{ fontSize: 9, fill: "#444", fontWeight: 900 }} tickFormatter={(v) => v?.slice(5)} />
                  <YAxis tick={{ fontSize: 9, fill: "#444" }} label={{ value: "Hours", angle: -90, position: "left", fontSize: 9, fill: "#666" }} />
                  <Tooltip contentStyle={{ background: "#0a0a0b", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 0, fontSize: 11 }} />
                  <Legend wrapperStyle={{ fontSize: 9, fontWeight: 900 }} />
                  <Area type="monotone" dataKey="totalHours" name="Total Hours" stroke="#8b5cf6" fill="#8b5cf6" fillOpacity={0.05} strokeWidth={1} strokeDasharray="3 3" />
                  <Area type="monotone" dataKey="productiveHours" name="Productive" stroke="#10b981" fill="#10b981" fillOpacity={0.15} strokeWidth={2} />
                  <Area type="monotone" dataKey="unproductiveHours" name="Unproductive" stroke="#ef4444" fill="#ef4444" fillOpacity={0.1} strokeWidth={1.5} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Employee Comparison */}
          <div className="border border-white/5 bg-white/[0.01]">
            <div className="p-5 bg-black/40 border-b border-white/5 flex items-center gap-3">
              <Users className="w-4 h-4 text-[#8b5cf6]/50" />
              <span className="text-[10px] font-black text-white uppercase tracking-widest">Employee Behavior Comparison</span>
            </div>
            <div className="divide-y divide-white/5">
              {employees.slice(0, 12).map((emp, i) => (
                <Link href={`/employees/${encodeURIComponent(emp.hostname)}`} key={i}
                  className="flex items-center justify-between p-4 hover:bg-white/[0.02] transition-all group">
                  <div className="flex items-center gap-4">
                    <span className="text-[10px] font-black text-gray-700 w-5">{i + 1}</span>
                    <div>
                      <p className="text-[11px] font-black text-white uppercase group-hover:text-[#8b5cf6] transition-colors">{emp.hostname}</p>
                      <p className="text-[9px] text-gray-600">{emp.username}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className={`text-[9px] font-black uppercase px-2 py-0.5 border ${emp.status === "Active" ? "text-[#10b981] border-[#10b981]/20 bg-[#10b981]/10" : "text-gray-600 border-white/10 bg-white/[0.02]"}`}>
                      {emp.status}
                    </span>
                    <span className="text-[8px] font-mono text-gray-700">{new Date(emp.lastActive).toLocaleString()}</span>
                    <ChevronRight className="w-3 h-3 text-gray-800 group-hover:text-[#8b5cf6] transition-colors" />
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function BehaviorStat({ label, value, total, color, icon: Icon, isCount }: any) {
  const pct = isCount ? value : total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div className="p-5 border border-white/5 bg-white/[0.01] hover:bg-white/[0.03] hover:border-white/10 transition-all duration-300 hover:-translate-y-1 group relative overflow-hidden">
      <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity">
        <Icon className="w-10 h-10" style={{ color }} />
      </div>
      <p className="text-[8px] font-black text-gray-600 uppercase tracking-[0.3em] mb-2">{label}</p>
      <p className="text-3xl font-black tracking-tighter" style={{ color, textShadow: `0 0 15px ${color}30` }}>
        {isCount ? value : `${pct}%`}
      </p>
      {!isCount && <p className="text-[9px] text-gray-700 font-bold mt-1">{value} / {total} events</p>}
      <div className="absolute bottom-0 left-0 h-0.5 transition-all duration-300 group-hover:w-full w-0" style={{ background: color }} />
    </div>
  );
}
