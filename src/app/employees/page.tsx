"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Users, Search, Filter, ChevronRight, Shield, RefreshCw, Loader2, Terminal, Zap, Monitor, TrendingUp, Eye, Clock, AlertTriangle } from "lucide-react";

interface Employee {
    hostname: string;
    username: string;
    status: string;
    lastActive: string;
}

export default function EmployeesPage() {
    const [employees, setEmployees] = useState<Employee[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState("");

    const fetchEmployees = async () => {
        setLoading(true);
        try {
            const res = await fetch("/api/employees");
            const data = await res.json();
            setEmployees(data);
        } catch (e) {
            console.error("Failed to fetch employees:", e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchEmployees();
    }, []);

    const filtered = employees.filter(emp =>
        emp.hostname.toLowerCase().includes(searchTerm.toLowerCase()) ||
        emp.username.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const activeCount = employees.filter(e => e.status === "Active").length;

    return (
        <div className="space-y-8 animate-in fade-in duration-700">
            {/* Header */}
            <div className="flex justify-between items-end border-b border-white/5 pb-10">
                <div className="space-y-4">
                    <div className="flex items-center gap-3">
                        <div className="w-1.5 h-1.5 bg-[#10b981]" />
                        <span className="text-[10px] font-black text-[#10b981] uppercase tracking-[0.4em]">Node Registry</span>
                    </div>
                    <h1 className="text-5xl font-black tracking-tighter text-white uppercase italic">Active<span className="text-[#10b981]">Staff</span></h1>
                    <p className="text-gray-600 font-bold text-xs uppercase tracking-[0.2em]">Registry of all authenticated endpoints on the local mesh.</p>
                </div>
                <div className="flex gap-4 items-center">
                    <div className="px-4 py-2 border border-[#10b981]/20 bg-[#10b981]/5">
                        <span className="text-[9px] font-black text-[#10b981] uppercase tracking-widest">{activeCount} Online</span>
                    </div>
                    <button
                        onClick={fetchEmployees}
                        className="px-8 py-4 bg-white text-black font-black text-[10px] uppercase tracking-[0.2em] hover:bg-[#10b981] transition-all flex items-center gap-3"
                    >
                        <RefreshCw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} />
                        Sync
                    </button>
                </div>
            </div>

            {/* Search */}
            <div className="flex gap-1 items-center bg-white/[0.02] border border-white/5 p-1">
                <div className="relative flex-1">
                    <Search className="absolute left-6 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                    <input
                        type="text"
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                        placeholder="FILTER BY CREDENTIAL, NODE_ID, OR PROTOCOL..."
                        className="w-full pl-16 pr-6 py-5 bg-transparent border-none outline-none text-[11px] font-black text-white uppercase tracking-widest placeholder:text-gray-700"
                    />
                </div>
            </div>

            {/* Employee Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-1">
                {loading ? (
                    [1, 2, 3, 4, 5, 6].map((_, i) => (
                        <div key={i} className="h-[280px] bg-white/[0.02] border border-white/5 flex items-center justify-center animate-pulse">
                            <Loader2 className="w-8 h-8 animate-spin text-gray-800" />
                        </div>
                    ))
                ) : filtered.length === 0 ? (
                    <div className="col-span-full py-32 text-center bg-white/[0.01] border border-white/5">
                        <Terminal className="w-12 h-12 text-gray-900 mx-auto mb-6" />
                        <p className="text-[10px] font-black text-gray-700 uppercase tracking-[0.4em] italic">No active handshakes detected</p>
                    </div>
                ) : (
                    filtered.map((emp, i) => (
                        <EmployeeTacticalCard key={i} emp={emp} />
                    ))
                )}
            </div>
        </div>
    );
}

function EmployeeTacticalCard({ emp }: { emp: Employee }) {
    const isActive = emp.status === "Active";
    const timeSinceActive = emp.lastActive
        ? Math.round((Date.now() - new Date(emp.lastActive).getTime()) / 60000)
        : null;

    return (
        <Link href={`/employees/${encodeURIComponent(emp.hostname)}`} className="block">
            <div className="p-8 bg-white/[0.02] border border-white/5 hover:border-[#10b981]/50 transition-all group relative overflow-hidden flex flex-col h-[280px] cursor-pointer">
                {/* Background Icon */}
                <div className="absolute top-0 right-0 p-4 opacity-[0.03] group-hover:opacity-10 transition-opacity pointer-events-none">
                    <Monitor className="w-24 h-24 text-white" />
                </div>

                {/* Header */}
                <div className="flex items-center gap-5 mb-6 relative z-10">
                    <div className="w-14 h-14 bg-black border border-white/10 flex items-center justify-center group-hover:border-[#10b981]/50 transition-colors">
                        <span className="text-xl font-black text-[#10b981] italic">{emp.username[0]?.toUpperCase()}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                        <h5 className="text-lg font-black text-white tracking-tighter uppercase group-hover:text-[#10b981] transition-colors leading-none truncate">{emp.username}</h5>
                        <p className="text-[10px] font-mono text-gray-600 uppercase mt-1.5">{emp.hostname}</p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-gray-800 group-hover:text-[#10b981] transition-colors" />
                </div>

                {/* Stats */}
                <div className="space-y-4 mt-auto">
                    <div className="flex justify-between items-center text-[10px] font-black">
                        <span className="text-gray-600 uppercase tracking-widest">Link Status</span>
                        <div className="flex items-center gap-3">
                            <div className={`w-1.5 h-1.5 ${isActive ? "bg-[#10b981] shadow-[0_0_10px_rgba(16,185,129,0.5)]" : "bg-gray-800"}`} />
                            <span className={isActive ? "text-white uppercase" : "text-gray-700 uppercase"}>{emp.status}</span>
                        </div>
                    </div>

                    <div className="flex justify-between items-center pt-4 border-t border-white/5">
                        <div className="space-y-0.5">
                            <p className="text-[8px] font-black text-gray-700 uppercase tracking-widest">Last Transmission</p>
                            <p className="text-[9px] font-mono text-gray-500">
                                {emp.lastActive ? new Date(emp.lastActive).toLocaleTimeString() : "N/A"}
                            </p>
                        </div>
                        {timeSinceActive !== null && (
                            <div className={`px-3 py-1 text-[8px] font-black uppercase tracking-widest ${timeSinceActive < 5 ? "bg-[#10b981]/10 text-[#10b981]" : timeSinceActive < 30 ? "bg-yellow-500/10 text-yellow-500" : "bg-red-500/10 text-red-500"}`}>
                                {timeSinceActive < 1 ? "Just now" : timeSinceActive < 60 ? `${timeSinceActive}m ago` : `${Math.round(timeSinceActive / 60)}h ago`}
                            </div>
                        )}
                    </div>

                    {/* Deep Dive CTA */}
                    <div className="pt-2 opacity-0 group-hover:opacity-100 transition-all flex items-center gap-2 justify-center">
                        <Eye className="w-3 h-3 text-[#10b981]" />
                        <span className="text-[9px] font-black text-[#10b981] uppercase tracking-[0.3em]">View Full Intelligence</span>
                    </div>
                </div>
            </div>
        </Link>
    );
}
