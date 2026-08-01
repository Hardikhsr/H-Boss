"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import {
  Shield, AlertTriangle, Users, Target, Eye, TrendingUp,
  Activity, Loader2, ChevronRight, Clock, Flame, Lock,
  UserX, FileWarning, Zap, BarChart3, ArrowUpRight
} from "lucide-react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, BarChart, Bar, Cell, RadarChart,
  Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis
} from "recharts";

interface UserRisk {
  hostname: string;
  username: string;
  risk_score: number;
  risk_level: string;
  total_incidents: number;
  watchlist: number;
  last_incident: string;
}

interface Incident {
  id: number;
  hostname: string;
  incident_type: string;
  severity: string;
  description: string;
  source: string;
  status: string;
  timestamp: string;
}

const SEVERITY_COLORS: Record<string, string> = {
  Critical: "#ef4444",
  High: "#f97316",
  Medium: "#f59e0b",
  Low: "#6b7280",
};

const RISK_LEVEL_COLORS: Record<string, string> = {
  Critical: "#ef4444",
  High: "#f97316",
  Medium: "#f59e0b",
  Low: "#10b981",
  None: "#6b7280",
};

export default function InsiderThreatsPage() {
  const [userRisks, setUserRisks] = useState<UserRisk[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [dlpStats, setDlpStats] = useState<any>({});
  const [topRisks, setTopRisks] = useState<any[]>([]);
  const [riskTimeline, setRiskTimeline] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const safe = async (url: string, fallback: any = []) => {
    try { const r = await fetch(url); if (!r.ok) return fallback; return await r.json(); } catch { return fallback; }
  };

  const fetchAll = useCallback(async () => {
    const [risks, incs, stats, topR, timeline] = await Promise.all([
      safe("/api/dlp/user-risk"),
      safe("/api/dlp/incidents"),
      safe("/api/dlp/stats", {}),
      safe("/api/top-risks"),
      safe("/api/risk-score"),
    ]);
    setUserRisks(Array.isArray(risks) ? risks : []);
    setIncidents(Array.isArray(incs) ? incs : []);
    setDlpStats(stats || {});
    setTopRisks(Array.isArray(topR) ? topR : []);
    setRiskTimeline(Array.isArray(timeline) ? timeline : []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); const i = setInterval(fetchAll, 30000); return () => clearInterval(i); }, [fetchAll]);

  const threatSummary = useMemo(() => {
    const critical = userRisks.filter(u => u.risk_level === "Critical").length;
    const high = userRisks.filter(u => u.risk_level === "High").length;
    const watchlisted = userRisks.filter(u => u.watchlist === 1).length;
    const totalIncidents = incidents.length;
    const activeIncidents = incidents.filter(i => i.status === "Open" || i.status === "Investigating").length;
    return { critical, high, watchlisted, totalIncidents, activeIncidents };
  }, [userRisks, incidents]);

  const radarData = useMemo(() => {
    return [
      { metric: "Data Exfil", value: dlpStats.usb_events || 0, max: 100 },
      { metric: "Policy Violations", value: dlpStats.total_incidents || 0, max: 100 },
      { metric: "Print Events", value: dlpStats.print_events || 0, max: 50 },
      { metric: "Clipboard", value: dlpStats.clipboard_events || 0, max: 100 },
      { metric: "High Risk Users", value: threatSummary.critical + threatSummary.high, max: 20 },
      { metric: "Active Incidents", value: threatSummary.activeIncidents, max: 50 },
    ];
  }, [dlpStats, threatSummary]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[600px] space-y-6">
        <Loader2 className="w-16 h-16 animate-spin text-[#10b981]" />
        <p className="text-[10px] font-black text-gray-600 uppercase tracking-[0.5em]">Analyzing Threat Landscape...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-700 pb-20">
      {/* Header */}
      <div className="flex justify-between items-end border-b border-white/5 pb-8">
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <div className="w-1.5 h-1.5 bg-red-500 animate-pulse" />
            <span className="text-[10px] font-black text-red-500 uppercase tracking-[0.4em]">Insider Risk Management</span>
          </div>
          <h1 className="text-5xl font-black tracking-tighter text-white uppercase italic">Threat<span className="text-red-500">Matrix</span></h1>
        </div>
        <div className="flex gap-3">
          <Link href="/dlp" className="px-6 py-3 border border-white/10 text-gray-400 font-black text-[10px] uppercase tracking-[0.2em] hover:border-white/30 transition-all flex items-center gap-2">
            <Shield className="w-3 h-3" /> DLP Policies
          </Link>
        </div>
      </div>

      {/* Threat Stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-1">
        <ThreatStat label="Critical Users" value={threatSummary.critical} icon={UserX} accent="#ef4444" />
        <ThreatStat label="High Risk" value={threatSummary.high} icon={AlertTriangle} accent="#f97316" />
        <ThreatStat label="Watchlisted" value={threatSummary.watchlisted} icon={Eye} accent="#f59e0b" />
        <ThreatStat label="Total Incidents" value={threatSummary.totalIncidents} icon={FileWarning} accent="#8b5cf6" />
        <ThreatStat label="Active Cases" value={threatSummary.activeIncidents} icon={Flame} accent="#ef4444" pulse />
      </div>

      {/* Threat Landscape & Radar */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-1">
        {/* Risk Timeline */}
        <div className="xl:col-span-8 p-6 border border-white/5 bg-white/[0.01]">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-[10px] font-black text-gray-600 uppercase tracking-[0.3em]">24h Threat Timeline</h3>
            <span className="text-[8px] font-black text-red-500/50 uppercase tracking-widest flex items-center gap-1">
              <span className="w-1 h-1 bg-red-500 animate-pulse rounded-full" /> Live Monitoring
            </span>
          </div>
          <div className="h-[250px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={riskTimeline}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" />
                <XAxis dataKey="hour" tick={{ fontSize: 9, fill: "#444", fontWeight: 900 }} />
                <YAxis tick={{ fontSize: 9, fill: "#444" }} />
                <Tooltip contentStyle={{ background: "#0a0a0b", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 0, fontSize: 11, fontWeight: 900 }} />
                <Area type="monotone" dataKey="criticals" name="Critical Events" stroke="#ef4444" fill="#ef4444" fillOpacity={0.2} strokeWidth={2} />
                <Area type="monotone" dataKey="unproductive_mins" name="Suspicious Mins" stroke="#f59e0b" fill="#f59e0b" fillOpacity={0.08} strokeWidth={1} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Threat Radar */}
        <div className="xl:col-span-4 p-6 border border-white/5 bg-white/[0.01]">
          <h3 className="text-[10px] font-black text-gray-600 uppercase tracking-[0.3em] mb-4">Threat Radar</h3>
          <div className="h-[250px]">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={radarData}>
                <PolarGrid stroke="rgba(255,255,255,0.05)" />
                <PolarAngleAxis dataKey="metric" tick={{ fontSize: 8, fill: "#666", fontWeight: 900 }} />
                <PolarRadiusAxis tick={false} axisLine={false} />
                <Radar name="Threats" dataKey="value" stroke="#ef4444" fill="#ef4444" fillOpacity={0.15} strokeWidth={2} />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* User Risk Matrix & Incident Feed */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-1">
        {/* Risk Users */}
        <div className="xl:col-span-7 border border-white/5 bg-white/[0.01]">
          <div className="p-5 bg-black/40 border-b border-white/5 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Target className="w-4 h-4 text-red-500/50" />
              <span className="text-[10px] font-black text-white uppercase tracking-widest">User Risk Matrix</span>
            </div>
            <span className="text-[8px] font-black text-gray-700 uppercase tracking-widest">{userRisks.length} Users Tracked</span>
          </div>
          <div className="divide-y divide-white/5 max-h-[500px] overflow-y-auto custom-scrollbar">
            {userRisks.length > 0 ? userRisks.slice(0, 15).map((user, i) => (
              <Link href={`/employees/${encodeURIComponent(user.hostname)}`} key={i}
                className="flex items-center justify-between p-4 hover:bg-white/[0.02] transition-all group cursor-pointer">
                <div className="flex items-center gap-4">
                  <div className="w-8 h-8 flex items-center justify-center border"
                    style={{ borderColor: `${RISK_LEVEL_COLORS[user.risk_level] || "#6b7280"}40`, background: `${RISK_LEVEL_COLORS[user.risk_level] || "#6b7280"}10` }}>
                    <span className="text-[10px] font-black" style={{ color: RISK_LEVEL_COLORS[user.risk_level] }}>{i + 1}</span>
                  </div>
                  <div>
                    <p className="text-[11px] font-black text-white uppercase group-hover:text-red-400 transition-colors">{user.hostname}</p>
                    <p className="text-[9px] text-gray-600">{user.username || "—"}</p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <p className="text-[11px] font-black" style={{ color: RISK_LEVEL_COLORS[user.risk_level] }}>{user.risk_score?.toFixed(1)}</p>
                    <p className="text-[8px] font-black uppercase tracking-widest" style={{ color: RISK_LEVEL_COLORS[user.risk_level] }}>{user.risk_level}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {user.watchlist === 1 && <Eye className="w-3 h-3 text-amber-500" />}
                    <span className="text-[9px] font-black text-gray-600">{user.total_incidents} inc</span>
                  </div>
                  {/* Risk Bar */}
                  <div className="w-20 h-1.5 bg-white/5 relative overflow-hidden">
                    <div className="absolute inset-y-0 left-0 transition-all" style={{
                      width: `${Math.min((user.risk_score || 0) * 10, 100)}%`,
                      background: RISK_LEVEL_COLORS[user.risk_level]
                    }} />
                  </div>
                  <ChevronRight className="w-3 h-3 text-gray-800 group-hover:text-red-500 transition-colors" />
                </div>
              </Link>
            )) : (
              <div className="py-16 text-center text-gray-700 text-[10px] font-black uppercase tracking-widest">No risk data available</div>
            )}
          </div>
        </div>

        {/* Recent Incidents */}
        <div className="xl:col-span-5 border border-white/5 bg-white/[0.01]">
          <div className="p-5 bg-black/40 border-b border-white/5 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Zap className="w-4 h-4 text-amber-500/50" />
              <span className="text-[10px] font-black text-white uppercase tracking-widest">Incident Feed</span>
            </div>
            <span className="px-2 py-0.5 text-[8px] font-black text-red-500 bg-red-500/10 border border-red-500/20 uppercase tracking-wider">
              {threatSummary.activeIncidents} Active
            </span>
          </div>
          <div className="divide-y divide-white/5 max-h-[500px] overflow-y-auto custom-scrollbar">
            {incidents.length > 0 ? incidents.slice(0, 20).map((inc) => (
              <div key={inc.id} className="p-4 hover:bg-white/[0.02] transition-colors">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5" style={{ background: SEVERITY_COLORS[inc.severity] || "#6b7280" }} />
                    <span className="text-[10px] font-black text-white uppercase">{inc.hostname}</span>
                    <span className="text-[8px] font-black px-1.5 py-0.5 uppercase tracking-wider border"
                      style={{
                        color: SEVERITY_COLORS[inc.severity],
                        borderColor: `${SEVERITY_COLORS[inc.severity]}30`,
                        background: `${SEVERITY_COLORS[inc.severity]}10`
                      }}>{inc.severity}</span>
                  </div>
                  <span className="text-[8px] font-mono text-gray-700">{new Date(inc.timestamp).toLocaleString()}</span>
                </div>
                <p className="text-[9px] text-gray-400 pl-4 mb-1">{inc.description || inc.incident_type}</p>
                <div className="flex items-center gap-3 pl-4">
                  <span className="text-[8px] font-black text-gray-600 uppercase">{inc.incident_type}</span>
                  <span className={`text-[8px] font-black uppercase px-1.5 py-0.5 ${inc.status === "Open" ? "text-red-400 bg-red-500/10" : inc.status === "Investigating" ? "text-amber-400 bg-amber-500/10" : "text-green-400 bg-green-500/10"}`}>
                    {inc.status}
                  </span>
                </div>
              </div>
            )) : (
              <div className="py-16 text-center text-gray-700 text-[10px] font-black uppercase tracking-widest">No incidents recorded</div>
            )}
          </div>
        </div>
      </div>

      {/* DLP Stats Overview */}
      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-1">
        <MiniStat label="USB Events" value={dlpStats.usb_events || 0} color="#f97316" />
        <MiniStat label="Clipboard Events" value={dlpStats.clipboard_events || 0} color="#8b5cf6" />
        <MiniStat label="Print Jobs" value={dlpStats.print_events || 0} color="#3b82f6" />
        <MiniStat label="Blocked Actions" value={dlpStats.blocked_clipboard || 0} color="#ef4444" />
        <MiniStat label="Network Events" value={dlpStats.network_events || 0} color="#06b6d4" />
        <MiniStat label="Total Incidents" value={dlpStats.total_incidents || 0} color="#f59e0b" />
      </div>
    </div>
  );
}

function ThreatStat({ label, value, icon: Icon, accent, pulse }: any) {
  return (
    <div className="p-6 border border-white/5 bg-white/[0.01] hover:bg-white/[0.03] hover:border-white/10 transition-all duration-300 hover:-translate-y-1 hover:shadow-xl cursor-pointer relative overflow-hidden group">
      <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
        <Icon className="w-12 h-12" style={{ color: accent }} />
      </div>
      <div className="relative z-10">
        <div className="flex justify-between items-start mb-4">
          <p className="text-[9px] font-black text-gray-500 uppercase tracking-[0.4em]">{label}</p>
          <div className="flex items-center gap-1">
            {pulse && <span className="w-1 h-1 bg-red-500 rounded-full animate-pulse" />}
            <Icon className="w-3.5 h-3.5 transition-colors group-hover:text-white" style={{ color: accent }} />
          </div>
        </div>
        <h3 className="text-4xl font-black tracking-tighter opacity-90 group-hover:opacity-100 transition-opacity" style={{ color: accent, textShadow: `0 0 15px ${accent}40` }}>{value}</h3>
      </div>
      <div className="absolute bottom-0 left-0 h-0.5 transition-all duration-300 group-hover:w-full w-0" style={{ background: accent }} />
    </div>
  );
}

function MiniStat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="p-5 border border-white/5 bg-white/[0.01] hover:bg-white/[0.02] transition-all group">
      <p className="text-[8px] font-black text-gray-600 uppercase tracking-[0.3em] mb-2">{label}</p>
      <p className="text-2xl font-black tracking-tighter group-hover:opacity-100 opacity-80 transition-opacity" style={{ color }}>{value}</p>
    </div>
  );
}
