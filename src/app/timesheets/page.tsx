"use client";

import { useEffect, useState } from "react";
import {
    Clock, Calendar, Users, ChevronDown, TrendingUp,
    Download, Filter, Loader2, Terminal, Zap, BarChart3
} from "lucide-react";
import {
    BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
    CartesianGrid, Legend
} from "recharts";

interface TimesheetEntry {
    period: string;
    hostname: string;
    username: string;
    totalHours: number;
    productiveHours: number;
    unproductiveHours: number;
    browsingHours: number;
    firstActivity: string;
    lastActivity: string;
}

export default function TimesheetsPage() {
    const [data, setData] = useState<TimesheetEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [period, setPeriod] = useState<"daily" | "weekly" | "monthly">("daily");
    const [filterHost, setFilterHost] = useState("");
    const [employees, setEmployees] = useState<any[]>([]);
    const [page, setPage] = useState(0);
    const PAGE_SIZE = 20;

    useEffect(() => {
        fetch("/api/employees").then(r => r.json()).then(setEmployees).catch(() => { });
    }, []);

    useEffect(() => {
        setLoading(true);
        const url = `/api/timesheets?period=${period}${filterHost ? `&hostname=${filterHost}` : ""}`;
        fetch(url)
            .then(r => r.json())
            .then(d => { setData(d); setPage(0); setLoading(false); })
            .catch(() => setLoading(false));
    }, [period, filterHost]);

    const paginatedData = data.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
    const totalPages = Math.ceil(data.length / PAGE_SIZE);

    const exportCSV = () => {
        if (data.length === 0) return;
        const headers = "Period,Hostname,Username,Clock In,Clock Out,Total Hours,Productive Hours,Unproductive Hours,Browsing Hours\n";
        const rows = data.map(e => `${e.period},${e.hostname},${e.username},${e.firstActivity || ''},${e.lastActivity || ''},${e.totalHours.toFixed(2)},${e.productiveHours.toFixed(2)},${e.unproductiveHours.toFixed(2)},${e.browsingHours.toFixed(2)}`).join("\n");
        const blob = new Blob([headers + rows], { type: "text/csv" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a"); a.href = url; a.download = `timesheets_${period}_${new Date().toISOString().split('T')[0]}.csv`; a.click();
        URL.revokeObjectURL(url);
    };

    // Group by period for chart
    const chartData = data.reduce((acc: any[], entry) => {
        const existing = acc.find(a => a.period === entry.period);
        if (existing) {
            existing.totalHours += entry.totalHours;
            existing.productiveHours += entry.productiveHours;
            existing.unproductiveHours += entry.unproductiveHours;
        } else {
            acc.push({
                period: entry.period,
                totalHours: entry.totalHours,
                productiveHours: entry.productiveHours,
                unproductiveHours: entry.unproductiveHours,
            });
        }
        return acc;
    }, []).reverse().slice(-14);

    // Totals
    const totalHours = data.reduce((s, d) => s + d.totalHours, 0);
    const totalProductive = data.reduce((s, d) => s + d.productiveHours, 0);
    const totalUnproductive = data.reduce((s, d) => s + d.unproductiveHours, 0);
    const avgProductivity = totalHours > 0 ? Math.round((totalProductive / totalHours) * 100) : 0;

    return (
        <div className="space-y-8 animate-in fade-in duration-700 pb-20">
            {/* Header */}
            <div className="flex justify-between items-end border-b border-white/5 pb-10">
                <div className="space-y-4">
                    <div className="flex items-center gap-3">
                        <div className="w-1.5 h-1.5 bg-[#10b981]" />
                        <span className="text-[10px] font-black text-[#10b981] uppercase tracking-[0.4em]">Workforce Analytics</span>
                    </div>
                    <h1 className="text-5xl font-black tracking-tighter text-white uppercase italic">Time<span className="text-[#10b981]">Sheets</span></h1>
                    <p className="text-gray-600 font-bold text-xs uppercase tracking-[0.2em] max-w-xl">
                        Digital timesheet reporting with granular hour breakdowns per employee per period.
                    </p>
                </div>

                <div className="flex gap-3">
                    {(["daily", "weekly", "monthly"] as const).map(p => (
                        <button
                            key={p}
                            onClick={() => setPeriod(p)}
                            className={`px-6 py-3 text-[10px] font-black uppercase tracking-[0.3em] border transition-all ${period === p ? "bg-[#10b981] text-black border-[#10b981] shadow-[0_0_20px_rgba(16,185,129,0.2)]" : "border-white/10 text-gray-500 hover:text-white hover:bg-white/5"}`}
                        >
                            {p}
                        </button>
                    ))}
                </div>
            </div>

            {/* Summary Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-1">
                <TimesheetStat label="Total Hours" value={totalHours.toFixed(1)} suffix="hrs" icon={Clock} accent="#10b981" />
                <TimesheetStat label="Productive" value={totalProductive.toFixed(1)} suffix="hrs" icon={Zap} accent="#3b82f6" />
                <TimesheetStat label="Unproductive" value={totalUnproductive.toFixed(1)} suffix="hrs" icon={TrendingUp} accent="#ef4444" />
                <TimesheetStat label="Avg Efficiency" value={`${avgProductivity}`} suffix="%" icon={BarChart3} accent="#f59e0b" />
            </div>

            {/* Filter */}
            <div className="flex gap-4">
                <select
                    value={filterHost}
                    onChange={e => setFilterHost(e.target.value)}
                    className="bg-white/[0.03] border border-white/10 px-6 py-3 text-[11px] font-black text-white uppercase tracking-widest outline-none focus:border-[#10b981]/50 appearance-none cursor-pointer min-w-[200px]"
                >
                    <option value="">All Employees</option>
                    {employees.map(emp => (
                        <option key={emp.hostname} value={emp.hostname}>{emp.username} ({emp.hostname})</option>
                    ))}
                </select>
                <button onClick={exportCSV} disabled={data.length === 0}
                    className="px-6 py-3 bg-white/5 border border-white/10 text-gray-400 hover:text-white hover:border-white/20 text-[10px] font-black uppercase tracking-[0.2em] flex items-center gap-2 transition-all disabled:opacity-30">
                    <Download className="w-3 h-3" /> Export CSV
                </button>
            </div>

            {/* Hours Chart */}
            <div className="p-8 border border-white/5 bg-white/[0.01]">
                <h3 className="text-[10px] font-black text-gray-600 uppercase tracking-[0.3em] mb-6">Hours Distribution</h3>
                <div className="h-[300px]">
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={chartData}>
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" />
                            <XAxis dataKey="period" tick={{ fontSize: 9, fill: "#555", fontWeight: 900 }} />
                            <YAxis tick={{ fontSize: 9, fill: "#555" }} />
                            <Tooltip
                                contentStyle={{ background: "#0a0a0b", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 0, fontSize: 11, fontWeight: 900 }}
                            />
                            <Bar dataKey="productiveHours" name="Productive" fill="#10b981" stackId="a" radius={[0, 0, 0, 0]} />
                            <Bar dataKey="unproductiveHours" name="Unproductive" fill="#ef4444" stackId="a" radius={[2, 2, 0, 0]} />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* Table */}
            <div className="border border-white/5 bg-white/[0.01]">
                <div className="p-6 bg-black/40 border-b border-white/5 flex items-center gap-4">
                    <Terminal className="w-4 h-4 text-gray-700" />
                    <span className="text-[10px] font-black text-white uppercase tracking-widest">Timesheet Ledger</span>
                    <span className="text-[9px] font-black text-gray-700 uppercase tracking-widest ml-auto">{data.length} records</span>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead className="bg-[#10b981]/[0.02] border-b border-white/5">
                            <tr>
                                <th className="px-6 py-4 text-[9px] font-black text-gray-600 uppercase tracking-[0.3em]">Period</th>
                                <th className="px-6 py-4 text-[9px] font-black text-gray-600 uppercase tracking-[0.3em]">Agent</th>
                                <th className="px-6 py-4 text-[9px] font-black text-gray-600 uppercase tracking-[0.3em]">Clock In</th>
                                <th className="px-6 py-4 text-[9px] font-black text-gray-600 uppercase tracking-[0.3em]">Clock Out</th>
                                <th className="px-6 py-4 text-[9px] font-black text-gray-600 uppercase tracking-[0.3em]">Total</th>
                                <th className="px-6 py-4 text-[9px] font-black text-gray-600 uppercase tracking-[0.3em]">Productive</th>
                                <th className="px-6 py-4 text-[9px] font-black text-gray-600 uppercase tracking-[0.3em]">Unproductive</th>
                                <th className="px-6 py-4 text-[9px] font-black text-gray-600 uppercase tracking-[0.3em]">Efficiency</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                            {loading ? (
                                <tr><td colSpan={8} className="py-20 text-center">
                                    <Loader2 className="w-8 h-8 animate-spin text-[#10b981] mx-auto" />
                                </td></tr>
                            ) : data.length === 0 ? (
                                <tr><td colSpan={8} className="py-20 text-center text-gray-700 font-black text-[10px] uppercase tracking-[0.5em]">No timesheet data</td></tr>
                            ) : paginatedData.map((entry, i) => {
                                const eff = entry.totalHours > 0 ? Math.round((entry.productiveHours / entry.totalHours) * 100) : 0;
                                return (
                                    <tr key={i} className="hover:bg-white/[0.02] transition-colors group">
                                        <td className="px-6 py-5 text-[11px] font-black text-white">{entry.period}</td>
                                        <td className="px-6 py-5">
                                            <div>
                                                <p className="text-[11px] font-black text-white uppercase">{entry.hostname}</p>
                                                <p className="text-[9px] font-bold text-gray-600">{entry.username}</p>
                                            </div>
                                        </td>
                                        <td className="px-6 py-5 text-[10px] font-mono text-gray-500">{entry.firstActivity ? new Date(entry.firstActivity).toLocaleTimeString() : "—"}</td>
                                        <td className="px-6 py-5 text-[10px] font-mono text-gray-500">{entry.lastActivity ? new Date(entry.lastActivity).toLocaleTimeString() : "—"}</td>
                                        <td className="px-6 py-5 text-[11px] font-black text-white">{entry.totalHours.toFixed(1)}h</td>
                                        <td className="px-6 py-5 text-[11px] font-black text-[#10b981]">{entry.productiveHours.toFixed(1)}h</td>
                                        <td className="px-6 py-5 text-[11px] font-black text-red-500">{entry.unproductiveHours.toFixed(1)}h</td>
                                        <td className="px-6 py-5">
                                            <div className="flex items-center gap-3">
                                                <div className="w-16 h-1.5 bg-white/5 overflow-hidden">
                                                    <div className="h-full bg-[#10b981]" style={{ width: `${eff}%` }} />
                                                </div>
                                                <span className={`text-[10px] font-black ${eff > 60 ? "text-[#10b981]" : eff > 30 ? "text-yellow-500" : "text-red-500"}`}>{eff}%</span>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                    <div className="flex items-center justify-between p-4 border-t border-white/5">
                        <span className="text-[9px] font-black text-gray-600 uppercase tracking-widest">
                            Showing {page * PAGE_SIZE + 1} — {Math.min((page + 1) * PAGE_SIZE, data.length)} of {data.length}
                        </span>
                        <div className="flex gap-1">
                            <button onClick={() => setPage(Math.max(0, page - 1))} disabled={page === 0}
                                className="px-4 py-2 text-[10px] font-black uppercase border border-white/10 text-gray-500 hover:text-white disabled:opacity-20 transition-all">
                                Prev
                            </button>
                            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                                const p = page < 3 ? i : page - 2 + i;
                                if (p >= totalPages) return null;
                                return (
                                    <button key={p} onClick={() => setPage(p)}
                                        className={`px-3 py-2 text-[10px] font-black border transition-all ${p === page ? 'bg-[#10b981] text-black border-[#10b981]' : 'border-white/10 text-gray-500 hover:text-white'}`}>
                                        {p + 1}
                                    </button>
                                );
                            })}
                            <button onClick={() => setPage(Math.min(totalPages - 1, page + 1))} disabled={page >= totalPages - 1}
                                className="px-4 py-2 text-[10px] font-black uppercase border border-white/10 text-gray-500 hover:text-white disabled:opacity-20 transition-all">
                                Next
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

function TimesheetStat({ label, value, suffix, icon: Icon, accent }: any) {
    return (
        <div className="p-8 border border-white/5 bg-white/[0.01] hover:bg-white/[0.02] transition-all">
            <div className="flex justify-between items-start mb-4">
                <p className="text-[8px] font-black text-gray-600 uppercase tracking-[0.4em]">{label}</p>
                <Icon className="w-4 h-4 opacity-30" style={{ color: accent }} />
            </div>
            <h3 className="text-3xl font-black tracking-tighter italic" style={{ color: accent }}>
                {value}<span className="text-base ml-1 not-italic">{suffix}</span>
            </h3>
        </div>
    );
}
