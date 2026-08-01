"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import Link from "next/link";
import {
  Activity, Users, Clock, AlertOctagon, TrendingUp, Monitor,
  Search, ArrowRight, Eye, Shield, Loader2, Terminal, Zap, Lock,
  BarChart3, Target, Flame, ChevronRight, PieChart
} from "lucide-react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, Cell, PieChart as RPieChart, Pie
} from "recharts";

interface Stats {
  totalAlerts: number;
  activeAgents: number;
  riskScore: number;
}

interface ActivityItem {
  id: number;
  hostname: string;
  username: string;
  window_title: string;
  screen_path: string;
  timestamp: string;
  keystrokes: string;
  category: string;
  status: string;
}

const CATEGORY_COLORS: Record<string, string> = {
  Productive: "#10b981",
  Unproductive: "#ef4444",
  Browsing: "#3b82f6",
  Neutral: "#6b7280",
  System: "#8b5cf6",
};

export default function Dashboard() {
  const [stats, setStats] = useState<Stats>({ totalAlerts: 0, activeAgents: 0, riskScore: 0 });
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [riskData, setRiskData] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [topRisks, setTopRisks] = useState<any[]>([]);
  const [dashSummary, setDashSummary] = useState<any>({});
  const [appUsage, setAppUsage] = useState<any[]>([]);
  const [recentTriggers, setRecentTriggers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    const safe = async (url: string, fallback: any = []) => {
      try { const r = await fetch(url); if (!r.ok) return fallback; return await r.json(); } catch { return fallback; }
    };
    try {
      const [statsData, actData, riskDataResult, catData, riskEmpData, summaryData, appData, triggerData] = await Promise.all([
        safe("/api/stats", { totalAlerts: 0, activeAgents: 0, riskScore: 0 }),
        safe("/api/activities"),
        safe("/api/risk-score"),
        safe("/api/categories"),
        safe("/api/top-risks"),
        safe("/api/dashboard-summary", {}),
        safe("/api/app-usage"),
        safe("/api/trigger-log?limit=5"),
      ]);
      setStats(statsData);
      setActivities(actData);
      setRiskData(riskDataResult);
      setCategories(catData);
      setTopRisks(riskEmpData);
      setDashSummary(summaryData);
      setAppUsage(Array.isArray(appData) ? appData.slice(0, 8) : []);
      setRecentTriggers(Array.isArray(triggerData) ? triggerData : []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
    const interval = setInterval(fetchAll, 30000); // 30s instead of 10s
    return () => clearInterval(interval);
  }, [fetchAll]);

  const riskPercent = useMemo(() => Math.round(stats.riskScore * 100), [stats.riskScore]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[600px] space-y-6">
        <Loader2 className="w-16 h-16 animate-spin text-[#10b981]" />
        <p className="text-[10px] font-black text-gray-600 uppercase tracking-[0.5em]">Initializing Command Node...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-700 pb-20">
      {/* Header */}
      <div className="flex justify-between items-end border-b border-white/5 pb-8">
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <div className="w-1.5 h-1.5 bg-[#10b981]" />
            <span className="text-[10px] font-black text-[#10b981] uppercase tracking-[0.4em]">HBOSE Command v6.0</span>
          </div>
          <h1 className="text-5xl font-black tracking-tighter text-white uppercase italic">Command<span className="text-[#10b981]">Center</span></h1>
        </div>
        <div className="flex gap-3">
          <Link href="/live" className="px-6 py-3 bg-[#10b981] text-black font-black text-[10px] uppercase tracking-[0.2em] hover:bg-[#10b981]/80 transition-all flex items-center gap-2">
            <Eye className="w-3 h-3" /> Live View
          </Link>
        </div>
      </div>

      {/* Top Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-1">
        <DashStat label="Active Nodes" value={stats.activeAgents} icon={Users} accent="#10b981" />
        <DashStat label="Total Alerts" value={stats.totalAlerts} icon={AlertOctagon} accent="#ef4444" />
        <DashStat label="Risk Index" value={`${riskPercent}%`} icon={Shield} accent={riskPercent > 50 ? "#ef4444" : "#f59e0b"} />
        <DashStat label="Productivity" value={`${dashSummary.productivityRate || 0}%`} icon={TrendingUp} accent="#3b82f6"
          delta={dashSummary.productivityDelta ? `${dashSummary.productivityDelta > 0 ? "+" : ""}${dashSummary.productivityDelta}%` : undefined}
          deltaPositive={parseFloat(dashSummary.productivityDelta) > 0}
        />
        <DashStat label="Snaps Today" value={dashSummary.totalSnapsToday || 0} icon={Monitor} accent="#8b5cf6" />
        <DashStat label="Weekly Alerts" value={dashSummary.weeklyAlerts || 0} icon={Flame} accent="#f97316" />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-1">
        {/* Risk Timeline */}
        <div className="xl:col-span-8 p-6 border border-white/5 bg-white/[0.01]">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-[10px] font-black text-gray-600 uppercase tracking-[0.3em]">24h Risk Timeline</h3>
            <span className="text-[8px] font-black text-gray-700 uppercase tracking-widest">Auto-refresh: 30s</span>
          </div>
          <div className="h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={riskData}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" />
                <XAxis dataKey="hour" tick={{ fontSize: 9, fill: "#444", fontWeight: 900 }} />
                <YAxis tick={{ fontSize: 9, fill: "#444" }} />
                <Tooltip contentStyle={{ background: "#0a0a0b", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 0, fontSize: 11, fontWeight: 900 }} />
                <Area type="monotone" dataKey="criticals" stroke="#ef4444" fill="#ef4444" fillOpacity={0.15} strokeWidth={2} />
                <Area type="monotone" dataKey="unproductive_mins" stroke="#f59e0b" fill="#f59e0b" fillOpacity={0.08} strokeWidth={1} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Category Breakdown */}
        <div className="xl:col-span-4 p-6 border border-white/5 bg-white/[0.01]">
          <h3 className="text-[10px] font-black text-gray-600 uppercase tracking-[0.3em] mb-4">Activity Breakdown</h3>
          <div className="h-[180px]">
            <ResponsiveContainer width="100%" height="100%">
              <RPieChart>
                <Pie data={categories} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={2} dataKey="value">
                  {categories.map((entry, i) => (
                    <Cell key={i} fill={CATEGORY_COLORS[entry.name] || "#6b7280"} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ background: "#0a0a0b", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 0, fontSize: 11 }} />
              </RPieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex flex-wrap gap-3 mt-2">
            {categories.map((c, i) => (
              <div key={i} className="flex items-center gap-1.5">
                <div className="w-2 h-2" style={{ background: CATEGORY_COLORS[c.name] || "#6b7280" }} />
                <span className="text-[8px] font-black text-gray-500 uppercase tracking-widest">{c.name}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Bottom Row: Top Risks + Top Apps + Recent Activity */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-1">
        {/* Top Risk Employees */}
        <div className="xl:col-span-4 border border-white/5 bg-white/[0.01]">
          <div className="p-5 bg-black/40 border-b border-white/5 flex items-center gap-3">
            <Target className="w-4 h-4 text-red-500/50" />
            <span className="text-[10px] font-black text-white uppercase tracking-widest">Risk Watchlist</span>
          </div>
          <div className="divide-y divide-white/5">
            {topRisks.slice(0, 5).map((emp, i) => (
              <Link href={`/employees/${encodeURIComponent(emp.hostname)}`} key={i} className="flex items-center justify-between p-4 border border-transparent hover:border-red-500/20 hover:bg-white/[0.02] transition-all duration-200 hover:-translate-y-0.5 cursor-pointer group">
                <div className="flex items-center gap-3">
                  <span className="text-[10px] font-black text-gray-700 w-5 group-hover:text-red-500 transition-colors">{i + 1}</span>
                  <div>
                    <p className="text-[11px] font-black text-white uppercase group-hover:text-red-400 transition-colors" style={{ textShadow: "0 0 10px rgba(248,113,113,0.2)" }}>{emp.hostname}</p>
                    <p className="text-[9px] text-gray-600 group-hover:text-gray-400 transition-colors">{emp.username}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1.5 bg-red-500/10 px-2 py-1 border border-red-500/20">
                    <AlertOctagon className="w-3 h-3 text-red-500" />
                    <span className="text-[10px] font-black text-red-500" style={{ textShadow: "0 0 10px rgba(239,68,68,0.5)" }}>{emp.alertCount}</span>
                  </div>
                  <ChevronRight className="w-3 h-3 text-gray-800 group-hover:text-red-500 transition-colors" />
                </div>
              </Link>
            ))}
            {topRisks.length === 0 && (
              <div className="py-12 text-center text-gray-700 text-[10px] font-black uppercase tracking-widest">No risk data</div>
            )}
          </div>
        </div>

        {/* Top Apps */}
        <div className="xl:col-span-4 border border-white/5 bg-white/[0.01]">
          <div className="p-5 bg-black/40 border-b border-white/5 flex items-center gap-3">
            <BarChart3 className="w-4 h-4 text-[#10b981]/50" />
            <span className="text-[10px] font-black text-white uppercase tracking-widest">Top Applications</span>
          </div>
          <div className="divide-y divide-white/5">
            {appUsage.map((app, i) => (
              <div key={i} className="p-4 hover:bg-white/[0.02] transition-colors relative overflow-hidden">
                <div className="absolute inset-y-0 left-0 bg-[#10b981]/[0.03]" style={{ width: `${app.percentage || 0}%` }} />
                <div className="relative flex justify-between items-center">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className={`w-1.5 h-1.5 shrink-0 ${CATEGORY_COLORS[app.category] ? "" : "bg-gray-600"}`}
                      style={{ background: CATEGORY_COLORS[app.category] || "#6b7280" }} />
                    <span className="text-[10px] font-black text-white uppercase truncate">{app.app}</span>
                  </div>
                  <span className="text-[10px] font-black text-gray-500 shrink-0 ml-3">{app.percentage}%</span>
                </div>
              </div>
            ))}
            {appUsage.length === 0 && (
              <div className="py-12 text-center text-gray-700 text-[10px] font-black uppercase tracking-widest">No app data</div>
            )}
          </div>
        </div>

        {/* Recent Triggers Feed */}
        <div className="xl:col-span-4 border border-white/5 bg-white/[0.01]">
          <div className="p-5 bg-black/40 border-b border-white/5 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Zap className="w-4 h-4 text-amber-400" />
              <span className="text-[10px] font-black text-white uppercase tracking-widest">Recent Triggers</span>
            </div>
            <Link href="/trigger-log" className="text-[8px] font-black text-gray-600 uppercase tracking-widest hover:text-amber-400 transition-colors flex items-center gap-1">
              View All <ArrowRight className="w-2.5 h-2.5" />
            </Link>
          </div>
          <div className="divide-y divide-white/5 max-h-[400px] overflow-y-auto custom-scrollbar">
            {recentTriggers.slice(0, 5).map((trig) => (
              <div key={trig.id} className="p-4 hover:bg-white/[0.02] transition-colors">
                <div className="flex justify-between items-start mb-1">
                  <span className="text-[10px] font-black text-white uppercase">{trig.hostname}</span>
                  <span className="text-[8px] font-mono text-gray-600">{new Date(trig.timestamp).toLocaleTimeString()}</span>
                </div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[9px] font-bold px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">
                    {trig.trigger_type.replace(/_/g, " ")}
                  </span>
                </div>
                <p className="text-[9px] text-gray-500 truncate" title={trig.trigger_detail}>{trig.trigger_detail || "—"}</p>
              </div>
            ))}
            {recentTriggers.length === 0 && (
              <div className="py-12 text-center text-gray-700 text-[10px] font-black uppercase tracking-widest">No triggers recorded</div>
            )}
          </div>
        </div>

        {/* Live Feed */}
        <div className="xl:col-span-4 border border-white/5 bg-white/[0.01]">
          <div className="p-5 bg-black/40 border-b border-white/5 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Activity className="w-4 h-4 text-[#10b981]/50" />
              <span className="text-[10px] font-black text-white uppercase tracking-widest">Live Feed</span>
            </div>
            <Link href="/alerts" className="text-[8px] font-black text-gray-600 uppercase tracking-widest hover:text-[#10b981] transition-colors flex items-center gap-1">
              View All <ArrowRight className="w-2.5 h-2.5" />
            </Link>
          </div>
          <div className="divide-y divide-white/5 max-h-[400px] overflow-y-auto custom-scrollbar">
            {activities.slice(0, 12).map((act) => (
              <div key={act.id} className="p-4 hover:bg-white/[0.02] transition-colors">
                <div className="flex justify-between items-start mb-1.5">
                  <div className="flex items-center gap-2">
                    <div className={`w-1.5 h-1.5 ${act.category === "Productive" ? "bg-[#10b981]" : act.category === "Unproductive" ? "bg-red-500" : "bg-gray-600"}`} />
                    <span className="text-[10px] font-black text-white uppercase">{act.hostname}</span>
                  </div>
                  <span className="text-[8px] font-mono text-gray-700">{new Date(act.timestamp).toLocaleTimeString()}</span>
                </div>
                <p className="text-[9px] font-bold text-gray-500 truncate pl-4">{act.window_title}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function DashStat({ label, value, icon: Icon, accent, delta, deltaPositive }: any) {
  return (
    <div className="p-6 border border-white/5 bg-white/[0.01] hover:bg-white/[0.03] hover:border-white/10 transition-all duration-300 hover:-translate-y-1 hover:shadow-xl cursor-pointer relative overflow-hidden group">
      <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
        <Icon className="w-12 h-12" style={{ color: accent }} />
      </div>
      <div className="relative z-10">
        <div className="flex justify-between items-start mb-4">
          <p className="text-[9px] font-black text-gray-500 uppercase tracking-[0.4em]">{label}</p>
          <Icon className="w-3.5 h-3.5 transition-colors group-hover:text-white" style={{ color: accent }} />
        </div>
        <h3 className="text-4xl font-black tracking-tighter opacity-90 group-hover:opacity-100 transition-opacity" style={{ color: accent, textShadow: `0 0 15px ${accent}40` }}>{value}</h3>
        {delta && (
          <p className={`text-[10px] font-black uppercase tracking-widest mt-3 ${deltaPositive ? 'text-[#10b981]' : 'text-red-500'}`}>
            {deltaPositive ? '↑' : '↓'} {delta} from yesterday
          </p>
        )}
      </div>
      <div className="absolute bottom-0 left-0 h-0.5 transition-all duration-300 group-hover:w-full w-0" style={{ background: accent }} />
    </div>
  );
}
