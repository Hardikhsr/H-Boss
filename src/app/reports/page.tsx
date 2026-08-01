"use client";

import { useEffect, useState } from "react";
import {
    FileText, Download, Trash2, RefreshCw, Loader2, BarChart3,
    Shield, Users, Clock, Plus, Eye, ChevronRight, Zap, AlertTriangle
} from "lucide-react";

interface Report {
    id: number;
    name: string;
    type: string;
    format: string;
    size: string;
    status: string;
    timestamp: string;
}

const REPORT_TYPES = [
    { id: "daily-summary", label: "Daily Summary", desc: "Today's productivity, activity, and alert overview", icon: BarChart3, color: "#10b981" },
    { id: "security-audit", label: "Security Audit", desc: "DLP incidents, USB events, threat analysis (7 days)", icon: Shield, color: "#ef4444" },
    { id: "team-efficiency", label: "Team Efficiency", desc: "Per-employee productivity and category breakdown", icon: Users, color: "#3b82f6" },
    { id: "time-tracking", label: "Time Tracking", desc: "Attendance, clock-in/out, hours worked (7 days)", icon: Clock, color: "#f59e0b" },
];

export default function ReportsPage() {
    const [reports, setReports] = useState<Report[]>([]);
    const [loading, setLoading] = useState(true);
    const [generating, setGenerating] = useState<string | null>(null);
    const [preview, setPreview] = useState<any>(null);
    const [previewName, setPreviewName] = useState("");

    const fetchReports = async () => {
        setLoading(true);
        try {
            const res = await fetch("/api/reports");
            const data = await res.json();
            setReports(Array.isArray(data) ? data : []);
        } catch (e) { console.error(e); }
        finally { setLoading(false); }
    };

    useEffect(() => { fetchReports(); }, []);

    const generateReport = async (type: string) => {
        setGenerating(type);
        try {
            const res = await fetch("/api/reports/generate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ type })
            });
            const data = await res.json();
            if (data.success) {
                setPreview(data.data);
                setPreviewName(data.name);
                fetchReports();
            }
        } catch (e) { console.error(e); }
        finally { setGenerating(null); }
    };

    const downloadReport = (id: number) => {
        window.open(`/api/reports/${id}/download`, "_blank");
    };

    const deleteReport = async (id: number) => {
        await fetch(`/api/reports/${id}`, { method: "DELETE" });
        fetchReports();
    };

    return (
        <div className="space-y-8 animate-in fade-in duration-700 pb-20">
            {/* Header */}
            <div className="flex justify-between items-end border-b border-white/5 pb-10">
                <div className="space-y-4">
                    <div className="flex items-center gap-3">
                        <div className="w-1.5 h-1.5 bg-[#10b981]" />
                        <span className="text-[10px] font-black text-[#10b981] uppercase tracking-[0.4em]">Intelligence Reports</span>
                    </div>
                    <h1 className="text-5xl font-black tracking-tighter text-white uppercase italic">Report<span className="text-[#10b981]">Center</span></h1>
                    <p className="text-gray-600 font-bold text-xs uppercase tracking-[0.2em]">Generate, download, and review intelligence reports from real data.</p>
                </div>
                <button onClick={fetchReports}
                    className="px-8 py-4 bg-white text-black font-black text-[10px] uppercase tracking-[0.2em] hover:bg-[#10b981] transition-all flex items-center gap-3">
                    <RefreshCw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} /> Refresh
                </button>
            </div>

            {/* Quick Generate Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-1">
                {REPORT_TYPES.map(rt => (
                    <button key={rt.id} onClick={() => generateReport(rt.id)} disabled={generating !== null}
                        className="p-6 border border-white/5 bg-white/[0.01] hover:bg-white/[0.03] transition-all text-left group relative overflow-hidden">
                        <div className="absolute top-0 right-0 p-3 opacity-[0.05] group-hover:opacity-10 transition-opacity">
                            <rt.icon className="w-20 h-20 text-white" />
                        </div>
                        <div className="relative z-10">
                            <div className="flex items-center justify-between mb-4">
                                <rt.icon className="w-5 h-5" style={{ color: rt.color }} />
                                {generating === rt.id ? (
                                    <Loader2 className="w-4 h-4 animate-spin text-white" />
                                ) : (
                                    <Zap className="w-3 h-3 text-gray-700 group-hover:text-[#10b981] transition-colors" />
                                )}
                            </div>
                            <h3 className="text-sm font-black text-white uppercase tracking-tight mb-1">{rt.label}</h3>
                            <p className="text-[9px] font-bold text-gray-600 uppercase tracking-wider">{rt.desc}</p>
                        </div>
                        <div className="mt-4 pt-3 border-t border-white/5 flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-all">
                            <Plus className="w-3 h-3 text-[#10b981]" />
                            <span className="text-[9px] font-black text-[#10b981] uppercase tracking-[0.3em]">Generate Now</span>
                        </div>
                    </button>
                ))}
            </div>

            {/* Preview Panel */}
            {preview && (
                <div className="border border-[#10b981]/30 bg-[#10b981]/5 p-6 space-y-4">
                    <div className="flex justify-between items-center">
                        <h3 className="text-sm font-black text-white uppercase tracking-tight flex items-center gap-3">
                            <Eye className="w-4 h-4 text-[#10b981]" /> {previewName}
                        </h3>
                        <button onClick={() => setPreview(null)} className="text-gray-500 hover:text-white text-[10px] font-black uppercase">Close Preview</button>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        {Object.entries(preview).filter(([_, v]) => typeof v === "number" || typeof v === "string").slice(0, 8).map(([key, value]) => (
                            <div key={key} className="p-3 bg-black/30 border border-white/5">
                                <p className="text-[8px] font-black text-gray-500 uppercase tracking-widest">{key.replace(/([A-Z])/g, ' $1').trim()}</p>
                                <p className="text-lg font-black text-white mt-1">{String(value)}</p>
                            </div>
                        ))}
                    </div>
                    {preview.perEmployee && Array.isArray(preview.perEmployee) && (
                        <div className="mt-4">
                            <h4 className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-3">Per Employee Breakdown</h4>
                            <div className="space-y-1">
                                {preview.perEmployee.slice(0, 8).map((emp: any, i: number) => (
                                    <div key={i} className="flex items-center justify-between p-3 bg-black/20 border border-white/5">
                                        <div className="flex items-center gap-3">
                                            <span className="text-[10px] font-black text-gray-700 w-5">{i + 1}</span>
                                            <span className="text-[11px] font-black text-white uppercase">{emp.hostname}</span>
                                        </div>
                                        <div className="flex items-center gap-6 text-[10px] font-bold">
                                            <span className="text-[#10b981]">{emp.productive} productive</span>
                                            <span className="text-gray-600">{emp.snaps} snaps</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                    {preview.alertsByType && Array.isArray(preview.alertsByType) && (
                        <div className="mt-4">
                            <h4 className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-3">Alerts by Type / Severity</h4>
                            <div className="space-y-1">
                                {preview.alertsByType.map((a: any, i: number) => (
                                    <div key={i} className="flex items-center justify-between p-3 bg-black/20 border border-white/5">
                                        <span className="text-[11px] font-black text-white uppercase">{a.type}</span>
                                        <div className="flex items-center gap-4">
                                            <span className="text-[10px] font-bold text-red-400">{a.severity}</span>
                                            <span className="text-[10px] font-black text-white">{a.count}</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Reports Archive */}
            <div className="border border-white/5">
                <div className="p-5 bg-white/[0.02] border-b border-white/5 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <FileText className="w-4 h-4 text-[#10b981]/50" />
                        <span className="text-[10px] font-black text-white uppercase tracking-widest">Generated Reports Archive</span>
                    </div>
                    <span className="text-[9px] font-bold text-gray-600 uppercase">{reports.length} Reports</span>
                </div>

                {loading ? (
                    <div className="flex items-center justify-center py-20">
                        <Loader2 className="w-8 h-8 animate-spin text-[#10b981]" />
                    </div>
                ) : reports.length === 0 ? (
                    <div className="py-20 text-center">
                        <FileText className="w-12 h-12 text-gray-900 mx-auto mb-4" />
                        <p className="text-[10px] font-black text-gray-700 uppercase tracking-[0.4em]">No reports generated yet — use the cards above</p>
                    </div>
                ) : (
                    <div className="divide-y divide-white/5">
                        {reports.map(report => (
                            <div key={report.id} className="flex items-center justify-between p-5 hover:bg-white/[0.01] transition-colors">
                                <div className="flex items-center gap-4 flex-1 min-w-0">
                                    <div className="w-10 h-10 bg-[#10b981]/10 border border-[#10b981]/20 flex items-center justify-center shrink-0">
                                        <FileText className="w-4 h-4 text-[#10b981]" />
                                    </div>
                                    <div className="min-w-0">
                                        <p className="text-[11px] font-black text-white uppercase truncate">{report.name}</p>
                                        <p className="text-[9px] font-bold text-gray-600 uppercase">{report.type} · {report.format} · {report.size}</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-6">
                                    <span className="text-[9px] font-mono text-gray-600">{new Date(report.timestamp).toLocaleString()}</span>
                                    <div className="flex gap-1">
                                        <button onClick={() => downloadReport(report.id)} title="Download"
                                            className="p-2 hover:bg-[#10b981]/10 text-gray-500 hover:text-[#10b981] transition-colors">
                                            <Download className="w-4 h-4" />
                                        </button>
                                        <button onClick={() => deleteReport(report.id)} title="Delete"
                                            className="p-2 hover:bg-red-500/10 text-gray-500 hover:text-red-500 transition-colors">
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
