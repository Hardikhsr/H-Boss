"use client";

import { useEffect, useState } from "react";
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
    PieChart, Pie, Cell, AreaChart, Area
} from "recharts";
import { Clock, TrendingUp, Zap, Monitor, RefreshCw, Loader2, Terminal, Target, Activity, Flame } from "lucide-react";

const CATEGORY_COLORS: Record<string, string> = {
    Productive: "#10b981",
    Unproductive: "#ef4444",
    Browsing: "#3b82f6",
    Neutral: "#6b7280",
    System: "#8b5cf6",
};

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function ProductivityPage() {
    const [productivityData, setProductivityData] = useState<any[]>([]);
    const [categoryData, setCategoryData] = useState<any[]>([]);
    const [idleStats, setIdleStats] = useState<any>({ today: {}, weeklyTrend: [] });
    const [heatmapData, setHeatmapData] = useState<any[]>([]);
    const [appUsage, setAppUsage] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    const fetchData = async () => {
        setLoading(true);
        try {
            const [prodRes, catRes, idleRes, heatRes, appRes] = await Promise.all([
                fetch("/api/productivity"),
                fetch("/api/categories"),
                fetch("/api/idle-stats"),
                fetch("/api/heatmap-global"),
                fetch("/api/app-usage"),
            ]);
            const [prodRaw, catRaw, idleRaw, heatRaw, appRaw] = await Promise.all([
                prodRes.json(), catRes.json(), idleRes.json(), heatRes.json(), appRes.json()
            ]);

            const grouped: any = {};
            prodRaw.forEach((row: any) => {
                if (!grouped[row.day]) grouped[row.day] = { day: row.day };
                grouped[row.day][row.category || "Business"] = parseFloat(row.hours.toFixed(2));
            });
            setProductivityData(Object.values(grouped));
            setCategoryData(catRaw.map((c: any) => ({ ...c, color: CATEGORY_COLORS[c.name] || "#a855f7" })));
            setIdleStats(idleRaw);
            setHeatmapData(heatRaw);
            setAppUsage(appRaw.slice(0, 10));
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchData(); }, []);

    // Build heatmap grid (7 days x 24 hours)
    const heatmapGrid: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0));
    const maxHeat = Math.max(...heatmapData.map((d: any) => d.count), 1);
    heatmapData.forEach((d: any) => {
        if (d.dayOfWeek >= 0 && d.dayOfWeek < 7 && d.hour >= 0 && d.hour < 24) {
            heatmapGrid[d.dayOfWeek][d.hour] = d.count;
        }
    });

    const todayTotal = idleStats.today?.total || 0;
    const todayProductive = idleStats.today?.productive || 0;
    const todayUnproductive = idleStats.today?.unproductive || 0;
    const todayBrowsing = idleStats.today?.browsing || 0;
    const todayIdle = idleStats.today?.idle || 0;
    const productivityRate = todayTotal > 0 ? Math.round((todayProductive / todayTotal) * 100) : 0;

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[600px] space-y-6">
                <Loader2 className="w-16 h-16 animate-spin text-[#10b981]" />
                <p className="text-[10px] font-black text-gray-600 uppercase tracking-[0.5em]">Analyzing Workforce...</p>
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
                        <span className="text-[10px] font-black text-[#10b981] uppercase tracking-[0.4em]">Workforce Analytics</span>
                    </div>
                    <h1 className="text-5xl font-black tracking-tighter text-white uppercase italic">Product<span className="text-[#10b981]">ivity</span></h1>
                    <p className="text-gray-600 font-bold text-xs uppercase tracking-[0.2em] max-w-xl">
                        Deep analysis of workforce efficiency with heatmaps, app usage, and idle detection intelligence.
                    </p>
                </div>
                <button onClick={fetchData} className="px-8 py-4 bg-white text-black font-black text-[10px] uppercase tracking-[0.2em] hover:bg-[#10b981] transition-all flex items-center gap-3">
                    <RefreshCw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} /> Refresh
                </button>
            </div>

            {/* Today's Summary Stats */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-1">
                <ProdStat label="Productivity" value={`${productivityRate}%`} accent="#10b981" />
                <ProdStat label="Productive" value={`${(todayProductive * 5 / 60).toFixed(1)}h`} accent="#10b981" />
                <ProdStat label="Unproductive" value={`${(todayUnproductive * 5 / 60).toFixed(1)}h`} accent="#ef4444" />
                <ProdStat label="Browsing" value={`${(todayBrowsing * 5 / 60).toFixed(1)}h`} accent="#3b82f6" />
                <ProdStat label="Idle/System" value={`${(todayIdle * 5 / 60).toFixed(1)}h`} accent="#6b7280" />
            </div>

            {/* Charts Row */}
            <div className="grid grid-cols-1 xl:grid-cols-12 gap-1">
                {/* Stacked Bar Chart */}
                <div className="xl:col-span-8 p-6 border border-white/5 bg-white/[0.01]">
                    <h3 className="text-[10px] font-black text-gray-600 uppercase tracking-[0.3em] mb-6">Daily Time Distribution</h3>
                    <div className="h-[280px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={productivityData}>
                                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" />
                                <XAxis dataKey="day" tick={{ fontSize: 9, fill: "#444", fontWeight: 900 }} />
                                <YAxis tick={{ fontSize: 9, fill: "#444" }} />
                                <Tooltip contentStyle={{ background: "#0a0a0b", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 0, fontSize: 11 }} />
                                <Bar dataKey="Productive" stackId="a" fill="#10b981" />
                                <Bar dataKey="Unproductive" stackId="a" fill="#ef4444" />
                                <Bar dataKey="Browsing" stackId="a" fill="#3b82f6" />
                                <Bar dataKey="Business" stackId="a" fill="#6b7280" radius={[2, 2, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Category Pie */}
                <div className="xl:col-span-4 p-6 border border-white/5 bg-white/[0.01]">
                    <h3 className="text-[10px] font-black text-gray-600 uppercase tracking-[0.3em] mb-4">Activity Breakdown</h3>
                    <div className="h-[200px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie data={categoryData} cx="50%" cy="50%" innerRadius={50} outerRadius={85} paddingAngle={2} dataKey="value">
                                    {categoryData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                                </Pie>
                                <Tooltip contentStyle={{ background: "#0a0a0b", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 0, fontSize: 11 }} />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                    <div className="grid grid-cols-2 gap-2 mt-3">
                        {categoryData.map((cat, i) => (
                            <div key={i} className="flex items-center justify-between p-2 bg-white/[0.03] border border-white/5">
                                <div className="flex items-center gap-2">
                                    <div className="w-2 h-2" style={{ background: cat.color }} />
                                    <span className="text-[8px] font-black text-gray-500 uppercase tracking-widest">{cat.name}</span>
                                </div>
                                <span className="text-[10px] font-black text-white">{cat.value}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Weekly Trend */}
            <div className="p-6 border border-white/5 bg-white/[0.01]">
                <h3 className="text-[10px] font-black text-gray-600 uppercase tracking-[0.3em] mb-6">7-Day Active vs Idle Trend</h3>
                <div className="h-[200px]">
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={idleStats.weeklyTrend || []}>
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" />
                            <XAxis dataKey="day" tick={{ fontSize: 9, fill: "#444" }} />
                            <YAxis tick={{ fontSize: 9, fill: "#444" }} />
                            <Tooltip contentStyle={{ background: "#0a0a0b", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 0, fontSize: 11 }} />
                            <Area type="monotone" dataKey="productiveHours" stroke="#10b981" fill="#10b981" fillOpacity={0.2} strokeWidth={2} name="Productive" />
                            <Area type="monotone" dataKey="unproductiveHours" stroke="#ef4444" fill="#ef4444" fillOpacity={0.1} strokeWidth={1.5} name="Unproductive" />
                            <Area type="monotone" dataKey="browsingHours" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.08} strokeWidth={1} name="Browsing" />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* Heatmap + App Usage */}
            <div className="grid grid-cols-1 xl:grid-cols-12 gap-1">
                {/* Activity Heatmap */}
                <div className="xl:col-span-8 p-6 border border-white/5 bg-white/[0.01]">
                    <h3 className="text-[10px] font-black text-gray-600 uppercase tracking-[0.3em] mb-6">Activity Heatmap (Last 30 Days)</h3>
                    <div className="overflow-x-auto">
                        <div className="min-w-[600px]">
                            {/* Hour labels */}
                            <div className="flex gap-0.5 mb-1 ml-12">
                                {Array.from({ length: 24 }, (_, h) => (
                                    <div key={h} className="flex-1 text-center text-[7px] font-black text-gray-700">{h}</div>
                                ))}
                            </div>
                            {/* Grid */}
                            {DAYS.map((day, dayIdx) => (
                                <div key={day} className="flex items-center gap-0.5 mb-0.5">
                                    <span className="w-10 text-[8px] font-black text-gray-600 uppercase tracking-widest text-right pr-2">{day}</span>
                                    {heatmapGrid[dayIdx].map((count, hourIdx) => {
                                        const intensity = count / maxHeat;
                                        return (
                                            <div
                                                key={hourIdx}
                                                className="flex-1 aspect-square transition-colors"
                                                style={{
                                                    background: count === 0
                                                        ? "rgba(255,255,255,0.02)"
                                                        : `rgba(16, 185, 129, ${Math.max(0.1, intensity)})`,
                                                }}
                                                title={`${day} ${hourIdx}:00 — ${count} activities`}
                                            />
                                        );
                                    })}
                                </div>
                            ))}
                            {/* Legend */}
                            <div className="flex items-center gap-2 mt-3 ml-12">
                                <span className="text-[7px] font-black text-gray-700 uppercase">Less</span>
                                {[0.05, 0.2, 0.4, 0.6, 0.8, 1].map((op, i) => (
                                    <div key={i} className="w-3 h-3" style={{ background: `rgba(16, 185, 129, ${op})` }} />
                                ))}
                                <span className="text-[7px] font-black text-gray-700 uppercase">More</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Top Apps */}
                <div className="xl:col-span-4 border border-white/5 bg-white/[0.01]">
                    <div className="p-5 bg-black/40 border-b border-white/5 flex items-center gap-3">
                        <Monitor className="w-4 h-4 text-[#10b981]/50" />
                        <span className="text-[10px] font-black text-white uppercase tracking-widest">App Time Breakdown</span>
                    </div>
                    <div className="divide-y divide-white/5">
                        {appUsage.map((app, i) => {
                            const maxSessions = Math.max(...appUsage.map((a: any) => a.sessions), 1);
                            const pct = (app.sessions / maxSessions) * 100;
                            return (
                                <div key={i} className="p-4 relative overflow-hidden hover:bg-white/[0.02] transition-colors">
                                    <div className="absolute inset-y-0 left-0 bg-[#10b981]/[0.03]" style={{ width: `${pct}%` }} />
                                    <div className="relative flex justify-between items-center">
                                        <div className="flex items-center gap-3 min-w-0 flex-1">
                                            <div className="w-1.5 h-1.5 shrink-0" style={{ background: CATEGORY_COLORS[app.category] || "#6b7280" }} />
                                            <span className="text-[10px] font-black text-white uppercase truncate">{app.app}</span>
                                        </div>
                                        <span className="text-[10px] font-black text-[#10b981] shrink-0 ml-2">{app.totalMinutes?.toFixed(0)}m</span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        </div>
    );
}

function ProdStat({ label, value, accent }: { label: string; value: string; accent: string }) {
    return (
        <div className="p-6 border border-white/5 bg-white/[0.01]">
            <p className="text-[8px] font-black text-gray-600 uppercase tracking-[0.4em] mb-3">{label}</p>
            <h3 className="text-2xl font-black tracking-tighter italic" style={{ color: accent }}>{value}</h3>
        </div>
    );
}
