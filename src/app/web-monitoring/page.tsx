"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import {
  Globe, Loader2, Shield, Clock, AlertTriangle, Eye,
  ExternalLink, Filter, BarChart3, TrendingUp, Ban,
  ChevronDown, Search
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, AreaChart, Area
} from "recharts";

const CATEGORY_COLORS: Record<string, string> = {
  Productive: "#10b981",
  Unproductive: "#ef4444",
  Browsing: "#3b82f6",
  Neutral: "#6b7280",
  Social: "#f97316",
  Blocked: "#dc2626",
};

export default function WebMonitoringPage() {
  const [activities, setActivities] = useState<any[]>([]);
  const [appUsage, setAppUsage] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");

  const safe = async (url: string, fallback: any = []) => {
    try { const r = await fetch(url); if (!r.ok) return fallback; return await r.json(); } catch { return fallback; }
  };

  const fetchAll = useCallback(async () => {
    const [acts, apps] = await Promise.all([
      safe("/api/activities"),
      safe("/api/app-usage"),
    ]);
    setActivities(Array.isArray(acts) ? acts : []);
    setAppUsage(Array.isArray(apps) ? apps : []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); const i = setInterval(fetchAll, 30000); return () => clearInterval(i); }, [fetchAll]);

  const webActivities = useMemo(() => {
    const browserKeywords = ["chrome", "firefox", "edge", "safari", "opera", "brave", "browser", "http", "www", ".com", ".org", ".net"];
    return activities.filter(a => {
      const title = (a.window_title || "").toLowerCase();
      return browserKeywords.some(k => title.includes(k));
    });
  }, [activities]);

  const filteredActivities = useMemo(() => {
    let filtered = webActivities;
    if (searchQuery) {
      filtered = filtered.filter(a => (a.window_title || "").toLowerCase().includes(searchQuery.toLowerCase()));
    }
    if (categoryFilter !== "all") {
      filtered = filtered.filter(a => a.category === categoryFilter);
    }
    return filtered;
  }, [webActivities, searchQuery, categoryFilter]);

  const websiteStats = useMemo(() => {
    const sites: Record<string, { count: number; category: string; minutes: number }> = {};
    webActivities.forEach(a => {
      const title = a.window_title || "Unknown";
      const domain = extractDomain(title);
      if (!sites[domain]) sites[domain] = { count: 0, category: a.category || "Neutral", minutes: 0 };
      sites[domain].count++;
      sites[domain].minutes += 5 / 60;
    });
    return Object.entries(sites)
      .map(([name, data]) => ({ name, ...data, minutes: Math.round(data.minutes * 10) / 10 }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 20);
  }, [webActivities]);

  const categoryBreakdown = useMemo(() => {
    const counts: Record<string, number> = {};
    webActivities.forEach(a => { counts[a.category || "Neutral"] = (counts[a.category || "Neutral"] || 0) + 1; });
    return Object.entries(counts).map(([name, value]) => ({ name, value }));
  }, [webActivities]);

  const hourlyUsage = useMemo(() => {
    const hours: Record<string, number> = {};
    webActivities.forEach(a => {
      const hour = new Date(a.timestamp).getHours().toString().padStart(2, "0") + ":00";
      hours[hour] = (hours[hour] || 0) + 1;
    });
    return Object.entries(hours).sort().map(([hour, count]) => ({ hour, count }));
  }, [webActivities]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[600px] space-y-6">
        <Loader2 className="w-16 h-16 animate-spin text-[#10b981]" />
        <p className="text-[10px] font-black text-gray-600 uppercase tracking-[0.5em]">Scanning Web Activity...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-700 pb-20">
      {/* Header */}
      <div className="flex justify-between items-end border-b border-white/5 pb-8">
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <div className="w-1.5 h-1.5 bg-[#3b82f6]" />
            <span className="text-[10px] font-black text-[#3b82f6] uppercase tracking-[0.4em]">Website Monitoring</span>
          </div>
          <h1 className="text-5xl font-black tracking-tighter text-white uppercase italic">Web<span className="text-[#3b82f6]">Guard</span></h1>
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-1">
        <WebStat label="Web Sessions" value={webActivities.length} color="#3b82f6" icon={Globe} />
        <WebStat label="Unique Sites" value={websiteStats.length} color="#10b981" icon={ExternalLink} />
        <WebStat label="Productive Browsing" value={`${webActivities.length > 0 ? Math.round(webActivities.filter(a => a.category === "Productive").length / webActivities.length * 100) : 0}%`} color="#10b981" icon={TrendingUp} />
        <WebStat label="Unproductive" value={webActivities.filter(a => a.category === "Unproductive").length} color="#ef4444" icon={AlertTriangle} />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-1">
        {/* Browsing Timeline */}
        <div className="xl:col-span-8 p-6 border border-white/5 bg-white/[0.01]">
          <h3 className="text-[10px] font-black text-gray-600 uppercase tracking-[0.3em] mb-4">Hourly Web Activity</h3>
          <div className="h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={hourlyUsage}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" />
                <XAxis dataKey="hour" tick={{ fontSize: 9, fill: "#444", fontWeight: 900 }} />
                <YAxis tick={{ fontSize: 9, fill: "#444" }} />
                <Tooltip contentStyle={{ background: "#0a0a0b", border: "1px solid rgba(59,130,246,0.3)", borderRadius: 0, fontSize: 11, fontWeight: 900 }} />
                <Area type="monotone" dataKey="count" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.15} strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Category Pie */}
        <div className="xl:col-span-4 p-6 border border-white/5 bg-white/[0.01]">
          <h3 className="text-[10px] font-black text-gray-600 uppercase tracking-[0.3em] mb-4">Web Category Mix</h3>
          <div className="h-[180px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={categoryBreakdown} cx="50%" cy="50%" innerRadius={45} outerRadius={75} paddingAngle={2} dataKey="value">
                  {categoryBreakdown.map((entry, i) => (
                    <Cell key={i} fill={CATEGORY_COLORS[entry.name] || "#6b7280"} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ background: "#0a0a0b", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 0, fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex flex-wrap gap-3 mt-2">
            {categoryBreakdown.map((c, i) => (
              <div key={i} className="flex items-center gap-1.5">
                <div className="w-2 h-2" style={{ background: CATEGORY_COLORS[c.name] || "#6b7280" }} />
                <span className="text-[8px] font-black text-gray-500 uppercase tracking-widest">{c.name}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Top Websites */}
      <div className="border border-white/5 bg-white/[0.01]">
        <div className="p-5 bg-black/40 border-b border-white/5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <BarChart3 className="w-4 h-4 text-[#3b82f6]/50" />
            <span className="text-[10px] font-black text-white uppercase tracking-widest">Top Websites Visited</span>
          </div>
        </div>
        <div className="divide-y divide-white/5">
          {websiteStats.map((site, i) => (
            <div key={i} className="p-4 hover:bg-white/[0.02] transition-colors relative overflow-hidden">
              <div className="absolute inset-y-0 left-0 transition-all"
                style={{
                  width: `${websiteStats[0]?.count > 0 ? (site.count / websiteStats[0].count) * 100 : 0}%`,
                  background: `${CATEGORY_COLORS[site.category] || "#6b7280"}08`
                }} />
              <div className="relative flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <span className="text-[10px] font-black text-gray-700 w-5">{i + 1}</span>
                  <div className="w-1.5 h-1.5" style={{ background: CATEGORY_COLORS[site.category] || "#6b7280" }} />
                  <div>
                    <p className="text-[11px] font-black text-white uppercase">{site.name}</p>
                    <span className="text-[8px] font-black text-gray-600 uppercase">{site.category}</span>
                  </div>
                </div>
                <div className="flex items-center gap-6">
                  <div className="text-right">
                    <p className="text-[10px] font-black text-white">{site.count}</p>
                    <p className="text-[8px] text-gray-700 uppercase">Visits</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] font-black text-[#3b82f6]">{site.minutes}m</p>
                    <p className="text-[8px] text-gray-700 uppercase">Time</p>
                  </div>
                </div>
              </div>
            </div>
          ))}
          {websiteStats.length === 0 && (
            <div className="py-16 text-center text-gray-700 text-[10px] font-black uppercase tracking-widest">No web activity detected</div>
          )}
        </div>
      </div>

      {/* Recent Web Activity */}
      <div className="border border-white/5 bg-white/[0.01]">
        <div className="p-5 bg-black/40 border-b border-white/5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Eye className="w-4 h-4 text-[#3b82f6]/50" />
            <span className="text-[10px] font-black text-white uppercase tracking-widest">Recent Web Activity</span>
          </div>
          {/* Search */}
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-600" />
              <input type="text" placeholder="Search..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                className="pl-8 pr-4 py-2 bg-white/[0.03] border border-white/10 text-[10px] text-white outline-none focus:border-[#3b82f6]/50 w-48 font-bold" />
            </div>
            <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}
              className="px-3 py-2 bg-white/[0.03] border border-white/10 text-[10px] text-gray-400 outline-none focus:border-[#3b82f6]/50 font-bold uppercase">
              <option value="all">All</option>
              <option value="Productive">Productive</option>
              <option value="Unproductive">Unproductive</option>
              <option value="Browsing">Browsing</option>
            </select>
          </div>
        </div>
        <div className="divide-y divide-white/5 max-h-[400px] overflow-y-auto custom-scrollbar">
          {filteredActivities.slice(0, 50).map((act) => (
            <div key={act.id} className="p-4 hover:bg-white/[0.02] transition-colors flex items-center justify-between">
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <div className="w-1.5 h-1.5 shrink-0" style={{ background: CATEGORY_COLORS[act.category] || "#6b7280" }} />
                <div className="min-w-0">
                  <p className="text-[10px] font-black text-white uppercase truncate">{act.window_title}</p>
                  <p className="text-[8px] text-gray-600">{act.hostname} — {act.category}</p>
                </div>
              </div>
              <span className="text-[8px] font-mono text-gray-700 shrink-0 ml-4">{new Date(act.timestamp).toLocaleString()}</span>
            </div>
          ))}
          {filteredActivities.length === 0 && (
            <div className="py-12 text-center text-gray-700 text-[10px] font-black uppercase tracking-widest">No web activity found</div>
          )}
        </div>
      </div>
    </div>
  );
}

function extractDomain(title: string): string {
  const patterns = [/— (.+?)$/i, /- (.+?)$/i, /\| (.+?)$/i];
  for (const p of patterns) {
    const match = title.match(p);
    if (match) return match[1].trim().slice(0, 40);
  }
  return title.slice(0, 40);
}

function WebStat({ label, value, color, icon: Icon }: any) {
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
