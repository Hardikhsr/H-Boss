"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import {
  Mail, MessageSquare, Share2, Loader2, Shield, AlertTriangle,
  Clock, Eye, Search, Filter, ChevronDown, BarChart3,
  Users, Zap, Lock, Globe
} from "lucide-react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell
} from "recharts";

const CHANNEL_COLORS: Record<string, string> = {
  Email: "#3b82f6",
  IM: "#8b5cf6",
  Social: "#f97316",
  Chat: "#10b981",
};

export default function CommunicationPage() {
  const [activities, setActivities] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"overview" | "email" | "messaging" | "social">("overview");
  const [searchQuery, setSearchQuery] = useState("");

  const safe = async (url: string, fallback: any = []) => {
    try { const r = await fetch(url); if (!r.ok) return fallback; return await r.json(); } catch { return fallback; }
  };

  const fetchAll = useCallback(async () => {
    const acts = await safe("/api/activities");
    setActivities(Array.isArray(acts) ? acts : []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); const i = setInterval(fetchAll, 30000); return () => clearInterval(i); }, [fetchAll]);

  const classifyChannel = (title: string): string => {
    const t = title.toLowerCase();
    if (["outlook", "gmail", "mail", "thunderbird", "yahoo mail", "protonmail"].some(k => t.includes(k))) return "Email";
    if (["slack", "teams", "discord", "telegram", "whatsapp", "signal", "messenger", "chat"].some(k => t.includes(k))) return "IM";
    if (["facebook", "twitter", "instagram", "linkedin", "tiktok", "reddit", "youtube", "snapchat", "x.com"].some(k => t.includes(k))) return "Social";
    return "";
  };

  const commActivities = useMemo(() => {
    return activities.filter(a => classifyChannel(a.window_title || "") !== "").map(a => ({
      ...a,
      channel: classifyChannel(a.window_title || "")
    }));
  }, [activities]);

  const filteredActivities = useMemo(() => {
    let filtered = commActivities;
    if (tab !== "overview") {
      const channelMap: Record<string, string> = { email: "Email", messaging: "IM", social: "Social" };
      filtered = filtered.filter(a => a.channel === channelMap[tab]);
    }
    if (searchQuery) {
      filtered = filtered.filter(a => (a.window_title || "").toLowerCase().includes(searchQuery.toLowerCase()));
    }
    return filtered;
  }, [commActivities, tab, searchQuery]);

  const channelBreakdown = useMemo(() => {
    const counts: Record<string, number> = { Email: 0, IM: 0, Social: 0 };
    commActivities.forEach(a => { counts[a.channel] = (counts[a.channel] || 0) + 1; });
    return Object.entries(counts).map(([name, value]) => ({ name, value }));
  }, [commActivities]);

  const topApps = useMemo(() => {
    const apps: Record<string, { count: number; channel: string }> = {};
    commActivities.forEach(a => {
      const title = a.window_title || "Unknown";
      const appName = extractAppName(title);
      if (!apps[appName]) apps[appName] = { count: 0, channel: a.channel };
      apps[appName].count++;
    });
    return Object.entries(apps)
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 12);
  }, [commActivities]);

  const hourlyActivity = useMemo(() => {
    const hours: Record<string, { email: number; im: number; social: number }> = {};
    commActivities.forEach(a => {
      const hour = new Date(a.timestamp).getHours().toString().padStart(2, "0") + ":00";
      if (!hours[hour]) hours[hour] = { email: 0, im: 0, social: 0 };
      if (a.channel === "Email") hours[hour].email++;
      if (a.channel === "IM") hours[hour].im++;
      if (a.channel === "Social") hours[hour].social++;
    });
    return Object.entries(hours).sort().map(([hour, data]) => ({ hour, ...data }));
  }, [commActivities]);

  const userActivity = useMemo(() => {
    const users: Record<string, { email: number; im: number; social: number; total: number }> = {};
    commActivities.forEach(a => {
      const h = a.hostname;
      if (!users[h]) users[h] = { email: 0, im: 0, social: 0, total: 0 };
      users[h][a.channel.toLowerCase() as "email" | "im" | "social"]++;
      users[h].total++;
    });
    return Object.entries(users)
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 10);
  }, [commActivities]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[600px] space-y-6">
        <Loader2 className="w-16 h-16 animate-spin text-[#10b981]" />
        <p className="text-[10px] font-black text-gray-600 uppercase tracking-[0.5em]">Scanning Communications...</p>
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
            <span className="text-[10px] font-black text-[#06b6d4] uppercase tracking-[0.4em]">Communication Monitoring</span>
          </div>
          <h1 className="text-5xl font-black tracking-tighter text-white uppercase italic">Comm<span className="text-[#06b6d4]">Sentinel</span></h1>
        </div>
        <div className="flex gap-1">
          {([
            { id: "overview" as const, label: "Overview", icon: BarChart3 },
            { id: "email" as const, label: "Email", icon: Mail },
            { id: "messaging" as const, label: "Messaging", icon: MessageSquare },
            { id: "social" as const, label: "Social Media", icon: Share2 },
          ]).map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`px-5 py-3 text-[10px] font-black uppercase tracking-wider border transition-all flex items-center gap-2 ${tab === t.id ? "border-[#06b6d4]/50 bg-[#06b6d4]/10 text-[#06b6d4]" : "border-white/10 text-gray-600 hover:text-white"}`}>
              <t.icon className="w-3 h-3" /> {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-1">
        <CommStat label="Total Comms" value={commActivities.length} color="#06b6d4" icon={Globe} />
        <CommStat label="Email Activity" value={channelBreakdown.find(c => c.name === "Email")?.value || 0} color="#3b82f6" icon={Mail} />
        <CommStat label="IM Activity" value={channelBreakdown.find(c => c.name === "IM")?.value || 0} color="#8b5cf6" icon={MessageSquare} />
        <CommStat label="Social Media" value={channelBreakdown.find(c => c.name === "Social")?.value || 0} color="#f97316" icon={Share2} />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-1">
        {/* Timeline */}
        <div className="xl:col-span-8 p-6 border border-white/5 bg-white/[0.01]">
          <h3 className="text-[10px] font-black text-gray-600 uppercase tracking-[0.3em] mb-4">Communication Activity by Hour</h3>
          <div className="h-[250px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={hourlyActivity}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" />
                <XAxis dataKey="hour" tick={{ fontSize: 9, fill: "#444", fontWeight: 900 }} />
                <YAxis tick={{ fontSize: 9, fill: "#444" }} />
                <Tooltip contentStyle={{ background: "#0a0a0b", border: "1px solid rgba(6,182,212,0.3)", borderRadius: 0, fontSize: 11, fontWeight: 900 }} />
                <Area type="monotone" dataKey="email" name="Email" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.15} stackId="1" />
                <Area type="monotone" dataKey="im" name="Messaging" stroke="#8b5cf6" fill="#8b5cf6" fillOpacity={0.15} stackId="1" />
                <Area type="monotone" dataKey="social" name="Social" stroke="#f97316" fill="#f97316" fillOpacity={0.15} stackId="1" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Channel Mix */}
        <div className="xl:col-span-4 p-6 border border-white/5 bg-white/[0.01]">
          <h3 className="text-[10px] font-black text-gray-600 uppercase tracking-[0.3em] mb-4">Channel Distribution</h3>
          <div className="h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={channelBreakdown} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={3} dataKey="value">
                  {channelBreakdown.map((entry, i) => (
                    <Cell key={i} fill={CHANNEL_COLORS[entry.name] || "#6b7280"} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ background: "#0a0a0b", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 0, fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex flex-wrap gap-3 mt-2">
            {channelBreakdown.map((c, i) => (
              <div key={i} className="flex items-center gap-1.5">
                <div className="w-2 h-2" style={{ background: CHANNEL_COLORS[c.name] || "#6b7280" }} />
                <span className="text-[8px] font-black text-gray-500 uppercase tracking-widest">{c.name} ({c.value})</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Top Apps + User Activity */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-1">
        {/* Top Communication Apps */}
        <div className="xl:col-span-5 border border-white/5 bg-white/[0.01]">
          <div className="p-5 bg-black/40 border-b border-white/5 flex items-center gap-3">
            <Zap className="w-4 h-4 text-[#06b6d4]/50" />
            <span className="text-[10px] font-black text-white uppercase tracking-widest">Top Communication Apps</span>
          </div>
          <div className="divide-y divide-white/5">
            {topApps.map((app, i) => (
              <div key={i} className="p-4 hover:bg-white/[0.02] transition-colors relative overflow-hidden">
                <div className="absolute inset-y-0 left-0" style={{
                  width: `${topApps[0]?.count > 0 ? (app.count / topApps[0].count) * 100 : 0}%`,
                  background: `${CHANNEL_COLORS[app.channel] || "#6b7280"}08`
                }} />
                <div className="relative flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-1.5 h-1.5" style={{ background: CHANNEL_COLORS[app.channel] || "#6b7280" }} />
                    <div>
                      <p className="text-[10px] font-black text-white uppercase">{app.name}</p>
                      <span className="text-[8px] font-black uppercase tracking-wider" style={{ color: CHANNEL_COLORS[app.channel] }}>{app.channel}</span>
                    </div>
                  </div>
                  <span className="text-[10px] font-black text-gray-500">{app.count}</span>
                </div>
              </div>
            ))}
            {topApps.length === 0 && (
              <div className="py-12 text-center text-gray-700 text-[10px] font-black uppercase tracking-widest">No communication apps detected</div>
            )}
          </div>
        </div>

        {/* User Communication Volume */}
        <div className="xl:col-span-7 p-6 border border-white/5 bg-white/[0.01]">
          <h3 className="text-[10px] font-black text-gray-600 uppercase tracking-[0.3em] mb-4">Communication Volume by User</h3>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={userActivity} layout="vertical" margin={{ left: 80 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 9, fill: "#444" }} />
                <YAxis dataKey="name" type="category" tick={{ fontSize: 8, fill: "#666", fontWeight: 900 }} width={80} />
                <Tooltip contentStyle={{ background: "#0a0a0b", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 0, fontSize: 11 }} />
                <Bar dataKey="email" name="Email" stackId="a" fill="#3b82f6" fillOpacity={0.7} />
                <Bar dataKey="im" name="IM" stackId="a" fill="#8b5cf6" fillOpacity={0.7} />
                <Bar dataKey="social" name="Social" stackId="a" fill="#f97316" fillOpacity={0.7} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Recent Activity Feed */}
      <div className="border border-white/5 bg-white/[0.01]">
        <div className="p-5 bg-black/40 border-b border-white/5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Eye className="w-4 h-4 text-[#06b6d4]/50" />
            <span className="text-[10px] font-black text-white uppercase tracking-widest">Communication Feed</span>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-600" />
            <input type="text" placeholder="Search communications..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
              className="pl-8 pr-4 py-2 bg-white/[0.03] border border-white/10 text-[10px] text-white outline-none focus:border-[#06b6d4]/50 w-56 font-bold" />
          </div>
        </div>
        <div className="divide-y divide-white/5 max-h-[400px] overflow-y-auto custom-scrollbar">
          {filteredActivities.length > 0 ? filteredActivities.slice(0, 50).map((act) => (
            <div key={act.id} className="p-4 hover:bg-white/[0.02] transition-colors flex items-center justify-between">
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <div className="w-6 h-6 flex items-center justify-center border shrink-0"
                  style={{ borderColor: `${CHANNEL_COLORS[act.channel]}30`, background: `${CHANNEL_COLORS[act.channel]}10` }}>
                  {act.channel === "Email" ? <Mail className="w-3 h-3" style={{ color: CHANNEL_COLORS.Email }} /> :
                   act.channel === "IM" ? <MessageSquare className="w-3 h-3" style={{ color: CHANNEL_COLORS.IM }} /> :
                   <Share2 className="w-3 h-3" style={{ color: CHANNEL_COLORS.Social }} />}
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] font-black text-white uppercase truncate">{act.window_title}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[8px] font-black text-gray-600">{act.hostname}</span>
                    <span className="text-[8px] font-black uppercase tracking-wider" style={{ color: CHANNEL_COLORS[act.channel] }}>{act.channel}</span>
                  </div>
                </div>
              </div>
              <span className="text-[8px] font-mono text-gray-700 shrink-0 ml-4">{new Date(act.timestamp).toLocaleString()}</span>
            </div>
          )) : (
            <div className="py-16 text-center text-gray-700 text-[10px] font-black uppercase tracking-widest">No communication activity detected</div>
          )}
        </div>
      </div>
    </div>
  );
}

function extractAppName(title: string): string {
  const patterns = [/— (.+?)$/i, /- (.+?)$/i, /\| (.+?)$/i];
  for (const p of patterns) {
    const match = title.match(p);
    if (match) return match[1].trim().slice(0, 30);
  }
  return title.slice(0, 30);
}

function CommStat({ label, value, color, icon: Icon }: any) {
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
