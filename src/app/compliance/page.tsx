"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import {
  ClipboardCheck, Shield, FileCheck, AlertTriangle, Loader2,
  CheckCircle, XCircle, Clock, Download, Filter, BarChart3,
  Lock, Eye, Printer, Usb, Globe, Database, ChevronDown
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell
} from "recharts";

const FRAMEWORKS = [
  { id: "gdpr", name: "GDPR", description: "General Data Protection Regulation", icon: "🇪🇺" },
  { id: "hipaa", name: "HIPAA", description: "Health Insurance Portability and Accountability", icon: "🏥" },
  { id: "pci-dss", name: "PCI DSS", description: "Payment Card Industry Data Security Standard", icon: "💳" },
  { id: "sox", name: "SOX", description: "Sarbanes-Oxley Act", icon: "📊" },
  { id: "iso27001", name: "ISO 27001", description: "Information Security Management", icon: "🔒" },
  { id: "nist", name: "NIST", description: "National Institute of Standards and Technology", icon: "🏛️" },
];

const STATUS_COLORS: Record<string, string> = {
  Compliant: "#10b981",
  "Partially Compliant": "#f59e0b",
  "Non-Compliant": "#ef4444",
  "Not Assessed": "#6b7280",
};

export default function CompliancePage() {
  const [compliance, setCompliance] = useState<any[]>([]);
  const [auditLog, setAuditLog] = useState<any[]>([]);
  const [dlpStats, setDlpStats] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [selectedFramework, setSelectedFramework] = useState("all");
  const [showFilters, setShowFilters] = useState(false);

  const safe = async (url: string, fallback: any = []) => {
    try { const r = await fetch(url); if (!r.ok) return fallback; return await r.json(); } catch { return fallback; }
  };

  const fetchAll = useCallback(async () => {
    const [comp, audit, stats] = await Promise.all([
      safe("/api/dlp/compliance"),
      safe("/api/dlp/audit-log"),
      safe("/api/dlp/stats", {}),
    ]);
    setCompliance(Array.isArray(comp) ? comp : []);
    setAuditLog(Array.isArray(audit) ? audit : []);
    setDlpStats(stats || {});
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const filteredCompliance = useMemo(() => {
    if (selectedFramework === "all") return compliance;
    return compliance.filter(c => c.framework === selectedFramework);
  }, [compliance, selectedFramework]);

  const complianceScore = useMemo(() => {
    if (compliance.length === 0) return 0;
    const compliant = compliance.filter(c => c.status === "Compliant").length;
    return Math.round((compliant / compliance.length) * 100);
  }, [compliance]);

  const statusBreakdown = useMemo(() => {
    const counts: Record<string, number> = {};
    compliance.forEach(c => { counts[c.status] = (counts[c.status] || 0) + 1; });
    return Object.entries(counts).map(([name, value]) => ({ name, value }));
  }, [compliance]);

  const auditByDay = useMemo(() => {
    const days: Record<string, number> = {};
    auditLog.forEach(a => {
      const day = a.timestamp?.split("T")[0] || a.timestamp?.split(" ")[0] || "unknown";
      days[day] = (days[day] || 0) + 1;
    });
    return Object.entries(days).slice(-14).map(([day, count]) => ({ day: day.slice(5), count }));
  }, [auditLog]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[600px] space-y-6">
        <Loader2 className="w-16 h-16 animate-spin text-[#10b981]" />
        <p className="text-[10px] font-black text-gray-600 uppercase tracking-[0.5em]">Loading Compliance Data...</p>
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
            <span className="text-[10px] font-black text-[#10b981] uppercase tracking-[0.4em]">Compliance Monitoring</span>
          </div>
          <h1 className="text-5xl font-black tracking-tighter text-white uppercase italic">Compli<span className="text-[#10b981]">ance</span></h1>
        </div>
      </div>

      {/* Overall Score + Stats */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-1">
        {/* Score Ring */}
        <div className="xl:col-span-3 p-8 border border-white/5 bg-white/[0.01] flex flex-col items-center justify-center">
          <div className="relative w-36 h-36 mb-4">
            <svg viewBox="0 0 120 120" className="w-full h-full -rotate-90">
              <circle cx="60" cy="60" r="52" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="8" />
              <circle cx="60" cy="60" r="52" fill="none"
                stroke={complianceScore >= 80 ? "#10b981" : complianceScore >= 50 ? "#f59e0b" : "#ef4444"}
                strokeWidth="8" strokeLinecap="butt"
                strokeDasharray={`${complianceScore * 3.27} ${327 - complianceScore * 3.27}`}
                className="transition-all duration-1000" />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-4xl font-black tracking-tighter"
                style={{ color: complianceScore >= 80 ? "#10b981" : complianceScore >= 50 ? "#f59e0b" : "#ef4444" }}>
                {complianceScore}%
              </span>
              <span className="text-[8px] font-black text-gray-600 uppercase tracking-widest">Score</span>
            </div>
          </div>
          <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest text-center">Overall Compliance</p>
        </div>

        {/* Status Breakdown */}
        <div className="xl:col-span-4 p-6 border border-white/5 bg-white/[0.01]">
          <h3 className="text-[10px] font-black text-gray-600 uppercase tracking-[0.3em] mb-4">Status Distribution</h3>
          <div className="h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={statusBreakdown} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={2} dataKey="value">
                  {statusBreakdown.map((entry, i) => (
                    <Cell key={i} fill={STATUS_COLORS[entry.name] || "#6b7280"} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ background: "#0a0a0b", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 0, fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex flex-wrap gap-3 mt-2">
            {statusBreakdown.map((s, i) => (
              <div key={i} className="flex items-center gap-1.5">
                <div className="w-2 h-2" style={{ background: STATUS_COLORS[s.name] || "#6b7280" }} />
                <span className="text-[8px] font-black text-gray-500 uppercase tracking-widest">{s.name} ({s.value})</span>
              </div>
            ))}
          </div>
        </div>

        {/* Audit Activity */}
        <div className="xl:col-span-5 p-6 border border-white/5 bg-white/[0.01]">
          <h3 className="text-[10px] font-black text-gray-600 uppercase tracking-[0.3em] mb-4">Audit Activity (14 Days)</h3>
          <div className="h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={auditByDay}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" />
                <XAxis dataKey="day" tick={{ fontSize: 9, fill: "#444", fontWeight: 900 }} />
                <YAxis tick={{ fontSize: 9, fill: "#444" }} />
                <Tooltip contentStyle={{ background: "#0a0a0b", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 0, fontSize: 11 }} />
                <Bar dataKey="count" fill="#10b981" fillOpacity={0.6} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Framework Cards */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-[10px] font-black text-gray-600 uppercase tracking-[0.3em]">Compliance Frameworks</h3>
          <button onClick={() => setShowFilters(!showFilters)}
            className="flex items-center gap-2 px-4 py-2 border border-white/10 text-gray-500 text-[10px] font-black uppercase tracking-wider hover:border-white/20 transition-all">
            <Filter className="w-3 h-3" /> Filter <ChevronDown className={`w-3 h-3 transition-transform ${showFilters ? "rotate-180" : ""}`} />
          </button>
        </div>

        {showFilters && (
          <div className="flex gap-2 mb-4 flex-wrap">
            <button onClick={() => setSelectedFramework("all")}
              className={`px-4 py-2 text-[10px] font-black uppercase tracking-wider border transition-all ${selectedFramework === "all" ? "border-[#10b981]/50 bg-[#10b981]/10 text-[#10b981]" : "border-white/10 text-gray-600"}`}>
              All
            </button>
            {FRAMEWORKS.map(fw => (
              <button key={fw.id} onClick={() => setSelectedFramework(fw.id)}
                className={`px-4 py-2 text-[10px] font-black uppercase tracking-wider border transition-all ${selectedFramework === fw.id ? "border-[#10b981]/50 bg-[#10b981]/10 text-[#10b981]" : "border-white/10 text-gray-600"}`}>
                {fw.icon} {fw.name}
              </button>
            ))}
          </div>
        )}

        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-1 mb-6">
          {FRAMEWORKS.map(fw => {
            const fwItems = compliance.filter(c => c.framework === fw.id);
            const compliant = fwItems.filter(c => c.status === "Compliant").length;
            const score = fwItems.length > 0 ? Math.round((compliant / fwItems.length) * 100) : 0;
            return (
              <button key={fw.id} onClick={() => setSelectedFramework(fw.id)}
                className={`p-5 border transition-all hover:-translate-y-1 hover:shadow-lg text-left ${selectedFramework === fw.id ? "border-[#10b981]/50 bg-[#10b981]/5" : "border-white/5 bg-white/[0.01] hover:bg-white/[0.03]"}`}>
                <span className="text-2xl mb-2 block">{fw.icon}</span>
                <p className="text-[11px] font-black text-white uppercase">{fw.name}</p>
                <p className="text-[8px] text-gray-600 mb-3">{fw.description}</p>
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-1 bg-white/5 overflow-hidden">
                    <div className="h-full transition-all duration-500" style={{
                      width: `${score}%`,
                      background: score >= 80 ? "#10b981" : score >= 50 ? "#f59e0b" : "#ef4444"
                    }} />
                  </div>
                  <span className="text-[9px] font-black" style={{
                    color: score >= 80 ? "#10b981" : score >= 50 ? "#f59e0b" : "#ef4444"
                  }}>{score}%</span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Compliance Items Table */}
      <div className="border border-white/5 bg-white/[0.01]">
        <div className="p-5 bg-black/40 border-b border-white/5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <ClipboardCheck className="w-4 h-4 text-[#10b981]/50" />
            <span className="text-[10px] font-black text-white uppercase tracking-widest">Compliance Requirements</span>
          </div>
          <span className="text-[8px] font-black text-gray-700 uppercase tracking-widest">{filteredCompliance.length} Items</span>
        </div>
        <div className="divide-y divide-white/5 max-h-[500px] overflow-y-auto custom-scrollbar">
          {filteredCompliance.length > 0 ? filteredCompliance.map((item) => (
            <div key={item.id} className="p-4 hover:bg-white/[0.02] transition-colors flex items-center justify-between">
              <div className="flex items-center gap-4 flex-1 min-w-0">
                {item.status === "Compliant" ? <CheckCircle className="w-4 h-4 text-[#10b981] shrink-0" /> :
                 item.status === "Non-Compliant" ? <XCircle className="w-4 h-4 text-red-500 shrink-0" /> :
                 item.status === "Partially Compliant" ? <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" /> :
                 <Clock className="w-4 h-4 text-gray-600 shrink-0" />}
                <div className="min-w-0">
                  <p className="text-[11px] font-black text-white uppercase truncate">{item.requirement || item.name}</p>
                  <div className="flex items-center gap-3 mt-0.5">
                    <span className="text-[8px] font-black text-gray-600 uppercase">{item.framework}</span>
                    {item.last_assessed && <span className="text-[8px] text-gray-700">Last: {new Date(item.last_assessed).toLocaleDateString()}</span>}
                  </div>
                </div>
              </div>
              <span className="text-[9px] font-black uppercase tracking-wider px-3 py-1 border shrink-0"
                style={{
                  color: STATUS_COLORS[item.status],
                  borderColor: `${STATUS_COLORS[item.status]}30`,
                  background: `${STATUS_COLORS[item.status]}10`
                }}>{item.status}</span>
            </div>
          )) : (
            <div className="py-16 text-center text-gray-700 text-[10px] font-black uppercase tracking-widest">
              No compliance data — configure frameworks in DLP settings
            </div>
          )}
        </div>
      </div>

      {/* Audit Log */}
      <div className="border border-white/5 bg-white/[0.01]">
        <div className="p-5 bg-black/40 border-b border-white/5 flex items-center gap-3">
          <Database className="w-4 h-4 text-[#10b981]/50" />
          <span className="text-[10px] font-black text-white uppercase tracking-widest">Audit Trail</span>
        </div>
        <div className="divide-y divide-white/5 max-h-[400px] overflow-y-auto custom-scrollbar">
          {auditLog.length > 0 ? auditLog.slice(0, 50).map((log) => (
            <div key={log.id} className="p-4 hover:bg-white/[0.02] transition-colors flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-1.5 h-1.5 bg-[#10b981]/50" />
                <div>
                  <p className="text-[10px] font-black text-white uppercase">{log.action}</p>
                  <p className="text-[9px] text-gray-600">{log.details}</p>
                </div>
              </div>
              <div className="flex items-center gap-4 shrink-0">
                <span className="text-[9px] font-black text-gray-600 uppercase">{log.actor || "System"}</span>
                <span className="text-[8px] font-mono text-gray-700">{new Date(log.timestamp).toLocaleString()}</span>
              </div>
            </div>
          )) : (
            <div className="py-12 text-center text-gray-700 text-[10px] font-black uppercase tracking-widest">No audit entries</div>
          )}
        </div>
      </div>
    </div>
  );
}
