"use client";

import { useEffect, useState, useCallback } from "react";
import {
    AlertTriangle, Plus, Trash2, Check, X, Search, RefreshCw,
    Loader2, Filter, Bell, Shield, ChevronDown, Send, CheckCheck,
    XCircle, Eye
} from "lucide-react";

interface Alert {
    id: number;
    hostname: string;
    type: string;
    message: string;
    severity: string;
    status: string;
    timestamp: string;
}

const SEVERITY_COLORS: Record<string, { bg: string; text: string; border: string }> = {
    Critical: { bg: "bg-red-500/10", text: "text-red-400", border: "border-red-500/30" },
    High: { bg: "bg-orange-500/10", text: "text-orange-400", border: "border-orange-500/30" },
    Medium: { bg: "bg-yellow-500/10", text: "text-yellow-400", border: "border-yellow-500/30" },
    Low: { bg: "bg-blue-500/10", text: "text-blue-400", border: "border-blue-500/30" },
};

export default function AlertsPage() {
    const [alerts, setAlerts] = useState<Alert[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState("");
    const [severityFilter, setSeverityFilter] = useState("");
    const [statusFilter, setStatusFilter] = useState("");
    const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
    const [showCreate, setShowCreate] = useState(false);
    const [employees, setEmployees] = useState<any[]>([]);

    // Create alert form
    const [newAlert, setNewAlert] = useState({
        message: "", severity: "Medium", type: "Manual", hostname: "", targets: [] as string[]
    });

    const fetchAlerts = useCallback(async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams();
            if (severityFilter) params.set("severity", severityFilter);
            if (statusFilter) params.set("status", statusFilter);
            const res = await fetch(`/api/alerts?${params}`);
            const data = await res.json();
            setAlerts(Array.isArray(data) ? data : []);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    }, [severityFilter, statusFilter]);

    useEffect(() => {
        fetchAlerts();
        fetch("/api/employees").then(r => r.json()).then(d => setEmployees(d)).catch(() => {});
    }, [fetchAlerts]);

    const filtered = alerts.filter(a =>
        (a.message?.toLowerCase().includes(searchTerm.toLowerCase()) ||
         a.hostname?.toLowerCase().includes(searchTerm.toLowerCase()) ||
         a.type?.toLowerCase().includes(searchTerm.toLowerCase()))
    );

    const createAlert = async () => {
        if (!newAlert.message.trim()) return;
        try {
            await fetch("/api/alerts", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(newAlert)
            });
            setShowCreate(false);
            setNewAlert({ message: "", severity: "Medium", type: "Manual", hostname: "", targets: [] });
            fetchAlerts();
        } catch (e) {
            console.error(e);
        }
    };

    const dismissAlert = async (id: number) => {
        await fetch(`/api/alerts/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "Dismissed" }) });
        fetchAlerts();
    };

    const deleteAlert = async (id: number) => {
        await fetch(`/api/alerts/${id}`, { method: "DELETE" });
        fetchAlerts();
    };

    const bulkAction = async (action: string) => {
        if (selectedIds.size === 0) return;
        await fetch("/api/alerts/bulk-action", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ids: Array.from(selectedIds), action })
        });
        setSelectedIds(new Set());
        fetchAlerts();
    };

    const toggleSelect = (id: number) => {
        const next = new Set(selectedIds);
        next.has(id) ? next.delete(id) : next.add(id);
        setSelectedIds(next);
    };

    const selectAll = () => {
        if (selectedIds.size === filtered.length) setSelectedIds(new Set());
        else setSelectedIds(new Set(filtered.map(a => a.id)));
    };

    const stats = {
        total: alerts.length,
        critical: alerts.filter(a => a.severity === "Critical" || a.severity === "High").length,
        active: alerts.filter(a => a.status === "Active" || !a.status).length,
        dismissed: alerts.filter(a => a.status === "Dismissed").length,
    };

    return (
        <div className="space-y-8 animate-in fade-in duration-700 pb-20">
            {/* Header */}
            <div className="flex justify-between items-end border-b border-white/5 pb-10">
                <div className="space-y-4">
                    <div className="flex items-center gap-3">
                        <div className="w-1.5 h-1.5 bg-red-500" />
                        <span className="text-[10px] font-black text-red-500 uppercase tracking-[0.4em]">Threat Intelligence</span>
                    </div>
                    <h1 className="text-5xl font-black tracking-tighter text-white uppercase italic">Alert<span className="text-red-500">Feed</span></h1>
                    <p className="text-gray-600 font-bold text-xs uppercase tracking-[0.2em]">Real-time security alerts, DLP violations, and manual alerts.</p>
                </div>
                <div className="flex gap-3">
                    <button onClick={() => setShowCreate(true)}
                        className="px-6 py-3 bg-red-500 text-white font-black text-[10px] uppercase tracking-[0.2em] hover:bg-red-600 transition-all flex items-center gap-2">
                        <Plus className="w-3 h-3" /> Create Alert
                    </button>
                    <button onClick={fetchAlerts}
                        className="px-6 py-3 bg-white text-black font-black text-[10px] uppercase tracking-[0.2em] hover:bg-[#10b981] transition-all flex items-center gap-2">
                        <RefreshCw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} /> Sync
                    </button>
                </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-4 gap-1">
                <div className="p-5 border border-white/5 bg-white/[0.01]"><p className="text-[8px] font-black text-gray-600 uppercase tracking-[0.3em]">Total Alerts</p><h3 className="text-2xl font-black tracking-tighter italic text-white mt-2">{stats.total}</h3></div>
                <div className="p-5 border border-white/5 bg-white/[0.01]"><p className="text-[8px] font-black text-gray-600 uppercase tracking-[0.3em]">Critical/High</p><h3 className="text-2xl font-black tracking-tighter italic text-red-500 mt-2">{stats.critical}</h3></div>
                <div className="p-5 border border-white/5 bg-white/[0.01]"><p className="text-[8px] font-black text-gray-600 uppercase tracking-[0.3em]">Active</p><h3 className="text-2xl font-black tracking-tighter italic text-orange-400 mt-2">{stats.active}</h3></div>
                <div className="p-5 border border-white/5 bg-white/[0.01]"><p className="text-[8px] font-black text-gray-600 uppercase tracking-[0.3em]">Dismissed</p><h3 className="text-2xl font-black tracking-tighter italic text-green-500 mt-2">{stats.dismissed}</h3></div>
            </div>

            {/* Filters + Search */}
            <div className="flex gap-3 items-center">
                <div className="relative flex-1">
                    <Search className="absolute left-5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-600" />
                    <input value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
                        placeholder="SEARCH ALERTS..."
                        className="w-full bg-white/[0.02] border border-white/5 pl-14 pr-4 py-4 text-[11px] font-black text-white uppercase tracking-widest outline-none focus:border-red-500/30 placeholder:text-gray-700" />
                </div>
                <select value={severityFilter} onChange={e => setSeverityFilter(e.target.value)}
                    className="bg-white/[0.02] border border-white/5 px-4 py-4 text-[10px] font-black text-white uppercase outline-none">
                    <option value="">All Severity</option>
                    <option value="Critical">Critical</option>
                    <option value="High">High</option>
                    <option value="Medium">Medium</option>
                    <option value="Low">Low</option>
                </select>
                <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
                    className="bg-white/[0.02] border border-white/5 px-4 py-4 text-[10px] font-black text-white uppercase outline-none">
                    <option value="">All Status</option>
                    <option value="Active">Active</option>
                    <option value="Dismissed">Dismissed</option>
                    <option value="Acknowledged">Acknowledged</option>
                    <option value="Resolved">Resolved</option>
                </select>
                {selectedIds.size > 0 && (
                    <div className="flex gap-1">
                        <button onClick={() => bulkAction("dismiss")} className="px-4 py-4 bg-yellow-500/10 border border-yellow-500/30 text-yellow-400 text-[10px] font-black uppercase flex items-center gap-2">
                            <CheckCheck className="w-3 h-3" /> Dismiss ({selectedIds.size})
                        </button>
                        <button onClick={() => bulkAction("delete")} className="px-4 py-4 bg-red-500/10 border border-red-500/30 text-red-400 text-[10px] font-black uppercase flex items-center gap-2">
                            <Trash2 className="w-3 h-3" /> Delete ({selectedIds.size})
                        </button>
                    </div>
                )}
            </div>

            {/* Create Alert Modal */}
            {showCreate && (
                <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center" onClick={() => setShowCreate(false)}>
                    <div className="bg-[#0a0a0c] border border-white/10 p-8 w-full max-w-lg space-y-6" onClick={e => e.stopPropagation()}>
                        <div className="flex justify-between items-center">
                            <h3 className="text-lg font-black text-white uppercase tracking-tight">Create Manual Alert</h3>
                            <button onClick={() => setShowCreate(false)}><X className="w-5 h-5 text-gray-500 hover:text-white" /></button>
                        </div>
                        <div className="space-y-4">
                            <div>
                                <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest block mb-2">Alert Message *</label>
                                <textarea value={newAlert.message} onChange={e => setNewAlert({ ...newAlert, message: e.target.value })}
                                    placeholder="Describe the alert..."
                                    className="w-full bg-white/[0.03] border border-white/10 p-4 text-sm text-white outline-none focus:border-red-500/50 min-h-[100px] resize-none" />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest block mb-2">Severity</label>
                                    <select value={newAlert.severity} onChange={e => setNewAlert({ ...newAlert, severity: e.target.value })}
                                        className="w-full bg-white/[0.03] border border-white/10 p-3 text-sm text-white outline-none">
                                        <option value="Critical">Critical</option>
                                        <option value="High">High</option>
                                        <option value="Medium">Medium</option>
                                        <option value="Low">Low</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest block mb-2">Type</label>
                                    <select value={newAlert.type} onChange={e => setNewAlert({ ...newAlert, type: e.target.value })}
                                        className="w-full bg-white/[0.03] border border-white/10 p-3 text-sm text-white outline-none">
                                        <option value="Manual">Manual</option>
                                        <option value="Security">Security</option>
                                        <option value="DLP">DLP</option>
                                        <option value="Policy">Policy Violation</option>
                                        <option value="System">System</option>
                                    </select>
                                </div>
                            </div>
                            <div>
                                <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest block mb-2">Target Machine</label>
                                <select value={newAlert.hostname} onChange={e => setNewAlert({ ...newAlert, hostname: e.target.value })}
                                    className="w-full bg-white/[0.03] border border-white/10 p-3 text-sm text-white outline-none">
                                    <option value="">All Machines</option>
                                    {employees.map((emp: any) => (
                                        <option key={emp.hostname} value={emp.hostname}>{emp.username} ({emp.hostname})</option>
                                    ))}
                                </select>
                            </div>
                        </div>
                        <button onClick={createAlert}
                            className="w-full py-4 bg-red-500 text-white font-black text-sm uppercase tracking-widest hover:bg-red-600 transition-all flex items-center justify-center gap-2">
                            <Send className="w-4 h-4" /> Deploy Alert
                        </button>
                    </div>
                </div>
            )}

            {/* Alert List */}
            <div className="border border-white/5">
                {/* Table Header */}
                <div className="grid grid-cols-[40px_1fr_120px_100px_100px_160px_120px] gap-4 p-4 bg-white/[0.02] border-b border-white/5 text-[9px] font-black text-gray-600 uppercase tracking-widest">
                    <div className="flex items-center justify-center">
                        <input type="checkbox" checked={selectedIds.size === filtered.length && filtered.length > 0} onChange={selectAll}
                            className="w-3 h-3 accent-red-500" />
                    </div>
                    <div>Message</div>
                    <div>Source</div>
                    <div>Type</div>
                    <div>Severity</div>
                    <div>Timestamp</div>
                    <div>Actions</div>
                </div>

                {loading ? (
                    <div className="flex items-center justify-center py-20">
                        <Loader2 className="w-8 h-8 animate-spin text-red-500" />
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="py-20 text-center">
                        <Bell className="w-12 h-12 text-gray-900 mx-auto mb-4" />
                        <p className="text-[10px] font-black text-gray-700 uppercase tracking-[0.4em]">No alerts found</p>
                    </div>
                ) : (
                    filtered.map(alert => {
                        const sev = SEVERITY_COLORS[alert.severity] || SEVERITY_COLORS.Medium;
                        const isDismissed = alert.status === "Dismissed" || alert.status === "Resolved";
                        return (
                            <div key={alert.id}
                                className={`grid grid-cols-[40px_1fr_120px_100px_100px_160px_120px] gap-4 p-4 border-b border-white/5 hover:bg-white/[0.01] transition-colors ${isDismissed ? "opacity-40" : ""}`}>
                                <div className="flex items-center justify-center">
                                    <input type="checkbox" checked={selectedIds.has(alert.id)} onChange={() => toggleSelect(alert.id)}
                                        className="w-3 h-3 accent-red-500" />
                                </div>
                                <div className="min-w-0">
                                    <p className="text-[11px] font-bold text-white truncate">{alert.message}</p>
                                    {alert.status && alert.status !== "Active" && (
                                        <span className="text-[8px] font-black text-gray-600 uppercase">{alert.status}</span>
                                    )}
                                </div>
                                <div className="text-[10px] font-black text-gray-400 uppercase">{alert.hostname || "—"}</div>
                                <div className="text-[10px] font-bold text-gray-500 uppercase">{alert.type || "Auto"}</div>
                                <div>
                                    <span className={`text-[9px] font-black uppercase px-2 py-1 ${sev.bg} ${sev.text} ${sev.border} border`}>
                                        {alert.severity || "Medium"}
                                    </span>
                                </div>
                                <div className="text-[10px] font-mono text-gray-600">{new Date(alert.timestamp).toLocaleString()}</div>
                                <div className="flex gap-1">
                                    {!isDismissed && (
                                        <button onClick={() => dismissAlert(alert.id)} title="Dismiss"
                                            className="p-2 hover:bg-yellow-500/10 text-gray-500 hover:text-yellow-400 transition-colors">
                                            <Check className="w-3.5 h-3.5" />
                                        </button>
                                    )}
                                    <button onClick={() => deleteAlert(alert.id)} title="Delete"
                                        className="p-2 hover:bg-red-500/10 text-gray-500 hover:text-red-400 transition-colors">
                                        <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                </div>
                            </div>
                        );
                    })
                )}
            </div>
        </div>
    );
}
