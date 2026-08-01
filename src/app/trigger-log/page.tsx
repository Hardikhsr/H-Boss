"use client";

import { useEffect, useState, useCallback } from "react";
import {
    Activity, ShieldAlert, AlertTriangle, Search, Filter,
    RefreshCw, Monitor, Play, CheckCircle2, AlertCircle, Loader2, Trash2
} from "lucide-react";
import { toast } from "sonner";
import io from "socket.io-client";

type TriggerItem = {
    id: number;
    hostname: string;
    trigger_type: string;
    trigger_detail: string;
    recording_id: number | null;
    recording_status: string | null;
    duration_seconds: number | null;
    frame_count: number | null;
    timestamp: string;
};

const TRIGGER_TYPE_COLORS: Record<string, { bg: string; text: string; border: string }> = {
    REMOTE_ACCESS_TOOL: { bg: "bg-red-500/10", text: "text-red-400", border: "border-red-500/20" },
    SENSITIVE_CONTENT: { bg: "bg-amber-500/10", text: "text-amber-400", border: "border-amber-500/20" },
    POLICY_VIOLATION_SITE: { bg: "bg-purple-500/10", text: "text-purple-400", border: "border-purple-500/20" },
    MANUAL_ADMIN_START: { bg: "bg-blue-500/10", text: "text-blue-400", border: "border-blue-500/20" },
};

export default function TriggerLogPage() {
    const [triggers, setTriggers] = useState<TriggerItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [filterType, setFilterType] = useState("ALL");
    const [searchHost, setSearchHost] = useState("");
    const [recordingFilter, setRecordingFilter] = useState("ALL");

    const fetchLogs = useCallback(async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams();
            if (filterType !== "ALL") params.append("trigger_type", filterType);
            if (searchHost.trim()) params.append("hostname", searchHost.trim());
            params.append("limit", "200");

            const res = await fetch(`/api/trigger-log?${params.toString()}`);
            const data = await res.json();
            setTriggers(Array.isArray(data) ? data : []);
        } catch (e) {
            console.error("Failed to fetch trigger logs", e);
            toast.error("Failed to load trigger logs");
        } finally {
            setLoading(false);
        }
    }, [filterType, searchHost]);

    useEffect(() => {
        fetchLogs();
    }, [fetchLogs]);

    // Socket subscription for real-time trigger events
    useEffect(() => {
        const socket = io();
        socket.on("trigger-event", (evt: any) => {
            toast.warning(`🚨 Trigger Fired: ${evt.trigger_type} on ${evt.hostname}`, {
                description: evt.trigger_detail
            });
            fetchLogs();
        });

        socket.on("trigger-session-end", () => {
            fetchLogs();
        });

        return () => {
            socket.disconnect();
        };
    }, [fetchLogs]);

    const filteredTriggers = triggers.filter(t => {
        if (recordingFilter === "RECORDING" && t.recording_status !== "Recording") return false;
        if (recordingFilter === "COMPLETED" && t.recording_status !== "Completed") return false;
        return true;
    });

    // KPI Metrics
    const totalTriggers = triggers.length;
    const ratCount = triggers.filter(t => t.trigger_type === "REMOTE_ACCESS_TOOL").length;
    const sensitiveCount = triggers.filter(t => t.trigger_type === "SENSITIVE_CONTENT").length;
    const siteCount = triggers.filter(t => t.trigger_type === "POLICY_VIOLATION_SITE").length;
    const activeRecordingCount = triggers.filter(t => t.recording_status === "Recording").length;

    return (
        <div className="space-y-8 animate-in fade-in duration-700 pb-20">
            {/* Header */}
            <div className="flex justify-between items-end border-b border-white/5 pb-8">
                <div className="space-y-3">
                    <div className="flex items-center gap-3">
                        <div className="w-2 h-2 rounded-full bg-[#10b981] animate-pulse" />
                        <span className="text-[10px] font-black text-[#10b981] uppercase tracking-[0.4em]">Security Event Engine</span>
                    </div>
                    <h1 className="text-3xl font-black text-white tracking-tight uppercase">Event Trigger Log</h1>
                    <p className="text-xs text-gray-500 font-mono">Automated risk-event recordings, pre-buffer captures & trigger history</p>
                </div>

                <div className="flex gap-3">
                    <button
                        onClick={async () => {
                            if (!confirm("Run instant manual purge of recordings & frames older than 48 hours?")) return;
                            try {
                                const res = await fetch("/api/storage/cleanup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ hours: 48 }) });
                                const data = await res.json();
                                if (data.success) {
                                    toast.success(`Purged ${data.deletedFiles} files & ${data.deletedRecords} records (>48h old).`);
                                    fetchLogs();
                                }
                            } catch { toast.error("Purge failed"); }
                        }}
                        className="flex items-center gap-2 px-4 py-2.5 bg-red-500/10 border border-red-500/20 hover:bg-red-500/20 text-xs font-mono text-red-400 transition-all rounded-lg"
                    >
                        <Trash2 className="w-3.5 h-3.5" />
                        Purge Storage (&gt;48h)
                    </button>
                    <button
                        onClick={fetchLogs}
                        className="flex items-center gap-2 px-4 py-2.5 bg-white/[0.03] border border-white/10 hover:bg-white/[0.08] text-xs font-mono text-white transition-all rounded-lg"
                    >
                        <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
                        Refresh Feed
                    </button>
                </div>
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="bg-white/[0.02] border border-white/5 p-5 rounded-xl space-y-2">
                    <div className="flex items-center justify-between text-gray-500">
                        <span className="text-[10px] font-black uppercase tracking-widest">Total Triggers</span>
                        <Activity className="w-4 h-4 text-emerald-400" />
                    </div>
                    <div className="text-2xl font-black text-white font-mono">{totalTriggers}</div>
                    <div className="text-[10px] text-gray-500">{activeRecordingCount} session(s) active</div>
                </div>

                <div className="bg-white/[0.02] border border-white/5 p-5 rounded-xl space-y-2">
                    <div className="flex items-center justify-between text-gray-500">
                        <span className="text-[10px] font-black uppercase tracking-widest">Remote Access (RAT)</span>
                        <ShieldAlert className="w-4 h-4 text-red-400" />
                    </div>
                    <div className="text-2xl font-black text-red-400 font-mono">{ratCount}</div>
                    <div className="text-[10px] text-gray-500">TeamViewer, AnyDesk, etc.</div>
                </div>

                <div className="bg-white/[0.02] border border-white/5 p-5 rounded-xl space-y-2">
                    <div className="flex items-center justify-between text-gray-500">
                        <span className="text-[10px] font-black uppercase tracking-widest">Sensitive Content</span>
                        <AlertTriangle className="w-4 h-4 text-amber-400" />
                    </div>
                    <div className="text-2xl font-black text-amber-400 font-mono">{sensitiveCount}</div>
                    <div className="text-[10px] text-gray-500">CC Luhn, SSN & Keywords</div>
                </div>

                <div className="bg-white/[0.02] border border-white/5 p-5 rounded-xl space-y-2">
                    <div className="flex items-center justify-between text-gray-500">
                        <span className="text-[10px] font-black uppercase tracking-widest">Policy Site Violations</span>
                        <AlertCircle className="w-4 h-4 text-purple-400" />
                    </div>
                    <div className="text-2xl font-black text-purple-400 font-mono">{siteCount}</div>
                    <div className="text-[10px] text-gray-500">Adult, Gambling, Uploads</div>
                </div>
            </div>

            {/* Filter Bar */}
            <div className="flex flex-wrap gap-4 items-center justify-between bg-white/[0.02] border border-white/5 p-4 rounded-xl">
                <div className="flex flex-wrap gap-3 items-center">
                    {/* Trigger Type Filter */}
                    <div className="flex items-center gap-2">
                        <Filter className="w-3.5 h-3.5 text-gray-500" />
                        <select
                            value={filterType}
                            onChange={(e) => setFilterType(e.target.value)}
                            className="bg-black/50 border border-white/10 px-3 py-1.5 text-xs text-white outline-none focus:border-[#10b981]/50 font-mono rounded"
                        >
                            <option value="ALL">All Trigger Types</option>
                            <option value="REMOTE_ACCESS_TOOL">Remote Access Tool (RAT)</option>
                            <option value="SENSITIVE_CONTENT">Sensitive Content (CC/SSN)</option>
                            <option value="POLICY_VIOLATION_SITE">Policy Violation Site</option>
                            <option value="MANUAL_ADMIN_START">Manual Admin Recording</option>
                        </select>
                    </div>

                    {/* Status Filter */}
                    <select
                        value={recordingFilter}
                        onChange={(e) => setRecordingFilter(e.target.value)}
                        className="bg-black/50 border border-white/10 px-3 py-1.5 text-xs text-white outline-none focus:border-[#10b981]/50 font-mono rounded"
                    >
                        <option value="ALL">All Statuses</option>
                        <option value="RECORDING">Currently Recording</option>
                        <option value="COMPLETED">Completed Session</option>
                    </select>
                </div>

                {/* Search Hostname */}
                <div className="relative">
                    <Search className="w-3.5 h-3.5 text-gray-500 absolute left-3 top-2.5" />
                    <input
                        type="text"
                        placeholder="Search Hostname..."
                        value={searchHost}
                        onChange={(e) => setSearchHost(e.target.value)}
                        className="bg-black/50 border border-white/10 pl-9 pr-3 py-1.5 text-xs text-white placeholder:text-gray-600 outline-none focus:border-[#10b981]/50 font-mono rounded w-56"
                    />
                </div>
            </div>

            {/* Trigger Log Table */}
            <div className="bg-white/[0.02] border border-white/5 rounded-xl overflow-hidden">
                {loading ? (
                    <div className="flex flex-col items-center justify-center py-20 space-y-4">
                        <Loader2 className="w-8 h-8 text-[#10b981] animate-spin" />
                        <span className="text-xs font-mono text-gray-500">Loading Trigger Event Stream...</span>
                    </div>
                ) : filteredTriggers.length === 0 ? (
                    <div className="text-center py-20 space-y-3">
                        <CheckCircle2 className="w-10 h-10 text-gray-600 mx-auto" />
                        <div className="text-sm font-bold text-gray-400">No Trigger Events Recorded</div>
                        <p className="text-xs text-gray-600 font-mono max-w-md mx-auto">
                            The event-triggered recording engine is active and waiting for risk events (RAT processes, sensitive keywords, policy site violations).
                        </p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse font-mono text-xs">
                            <thead>
                                <tr className="border-b border-white/5 bg-white/[0.01] text-gray-500 text-[10px] uppercase tracking-widest">
                                    <th className="p-4">Timestamp</th>
                                    <th className="p-4">Device (Host)</th>
                                    <th className="p-4">Trigger Type</th>
                                    <th className="p-4">Matched Context / Detail</th>
                                    <th className="p-4">Duration</th>
                                    <th className="p-4">Status</th>
                                    <th className="p-4 text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5 text-gray-300">
                                {filteredTriggers.map((item) => {
                                    const colors = TRIGGER_TYPE_COLORS[item.trigger_type] || {
                                        bg: "bg-gray-500/10", text: "text-gray-400", border: "border-gray-500/20"
                                    };

                                    return (
                                        <tr key={item.id} className="hover:bg-white/[0.02] transition-colors">
                                            <td className="p-4 text-gray-400 whitespace-nowrap">
                                                {new Date(item.timestamp).toLocaleString()}
                                            </td>
                                            <td className="p-4 font-bold text-white whitespace-nowrap">
                                                <div className="flex items-center gap-2">
                                                    <Monitor className="w-3.5 h-3.5 text-emerald-400" />
                                                    {item.hostname}
                                                </div>
                                            </td>
                                            <td className="p-4 whitespace-nowrap">
                                                <span className={`inline-flex items-center px-2.5 py-1 rounded text-[10px] font-bold tracking-wider uppercase border ${colors.bg} ${colors.text} ${colors.border}`}>
                                                    {item.trigger_type.replace(/_/g, " ")}
                                                </span>
                                            </td>
                                            <td className="p-4 text-gray-300 max-w-xs truncate" title={item.trigger_detail}>
                                                {item.trigger_detail || "—"}
                                            </td>
                                            <td className="p-4 whitespace-nowrap text-gray-400">
                                                {item.duration_seconds ? `${item.duration_seconds}s (${item.frame_count || 0} frames)` : "Recording..."}
                                            </td>
                                            <td className="p-4 whitespace-nowrap">
                                                {item.recording_status === "Recording" ? (
                                                    <span className="inline-flex items-center gap-1.5 text-red-400 font-bold">
                                                        <span className="w-2 h-2 rounded-full bg-red-500 animate-ping" />
                                                        RECORDING
                                                    </span>
                                                ) : item.recording_status === "Completed" ? (
                                                    <span className="text-emerald-400">Completed</span>
                                                ) : (
                                                    <span className="text-gray-500">{item.recording_status || "Logged"}</span>
                                                )}
                                            </td>
                                            <td className="p-4 text-right whitespace-nowrap">
                                                <a
                                                    href={`/recordings?hostname=${encodeURIComponent(item.hostname)}`}
                                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white/[0.04] hover:bg-white/[0.1] border border-white/10 text-white rounded text-[11px] font-bold transition-all"
                                                >
                                                    <Play className="w-3 h-3 text-emerald-400" />
                                                    Playback
                                                </a>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}
