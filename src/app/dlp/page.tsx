"use client";
import { useState, useEffect, useCallback } from "react";
import {
    Plus, ShieldAlert, Zap, Lock, Eye, Globe, Keyboard, Search as SearchIcon,
    Trash2, CheckCircle2, AlertTriangle, Terminal, Shield, MonitorSmartphone,
    Save, X, Power, Target, Loader2, ToggleLeft, ToggleRight, Edit3,
    Wifi, WifiOff, ChevronDown, ChevronUp, Filter, Layers, BookOpen,
    Fingerprint, Usb, Clipboard, Printer, Activity, FileWarning, Users,
    BarChart2, TrendingUp, AlertOctagon, Database, FileText, Cpu, Radio
} from "lucide-react";

const TABS = [
    { id: "content", label: "Content Intelligence", icon: Fingerprint, color: "#10b981" },
    { id: "endpoint", label: "Endpoint Shield", icon: Shield, color: "#3b82f6" },
    { id: "network", label: "Network Sentinel", icon: Globe, color: "#8b5cf6" },
    { id: "threats", label: "Threat Analytics", icon: AlertOctagon, color: "#ef4444" },
    { id: "compliance", label: "Compliance Center", icon: BookOpen, color: "#f59e0b" },
];

const SEVERITIES = ["Low", "Medium", "High", "Critical"];

interface Dict { id: number; name: string; description: string; category: string; keywords: string; weight: number; case_sensitive: number; proximity_words: number; status: string; }
interface RegexPat { id: number; name: string; description: string; pattern: string; category: string; severity: string; status: string; test_sample: string; }
interface Incident { id: number; hostname: string; username: string; incident_type: string; channel: string; severity: string; policy_name: string; content_snippet: string; action_taken: string; status: string; timestamp: string; }
interface UserRisk { hostname: string; username: string; risk_score: number; risk_level: string; total_incidents: number; critical_incidents: number; high_incidents: number; watchlist: number; last_incident: string; }
interface Compliance { id: number; framework: string; name: string; description: string; rules: string; controls: string; status: string; }
interface UsbEvent { id: number; hostname: string; device_name: string; device_type: string; action: string; policy_action: string; timestamp: string; }
interface ClipEvent { id: number; hostname: string; content_preview: string; source_app: string; action: string; blocked: number; timestamp: string; }
interface PrintEvent { id: number; hostname: string; document_name: string; printer_name: string; pages: number; blocked: number; timestamp: string; }
interface DlpStats { totalIncidents: number; openIncidents: number; criticalIncidents: number; todayIncidents: number; weekIncidents: number; activeDictionaries: number; activeRegex: number; usbEvents: number; clipboardBlocked: number; printEvents: number; highRiskUsers: number; watchlistUsers: number; byChannel: { channel: string; count: number }[]; bySeverity: { severity: string; count: number }[]; topPolicies: { policy_name: string; count: number; severity: string }[]; }

function getSevColor(s: string) {
    if (s === "Critical") return "bg-red-500/20 text-red-400 border-red-500/30";
    if (s === "High") return "bg-orange-500/15 text-orange-400 border-orange-500/30";
    if (s === "Medium") return "bg-amber-500/15 text-amber-400 border-amber-500/30";
    return "bg-emerald-500/10 text-emerald-400 border-emerald-500/30";
}
function getRiskColor(l: string) {
    if (l === "Critical") return "#ef4444";
    if (l === "High") return "#f97316";
    if (l === "Medium") return "#f59e0b";
    return "#10b981";
}

export default function DLPEnterprise() {
    const [tab, setTab] = useState("content");
    const [stats, setStats] = useState<DlpStats | null>(null);
    const [dicts, setDicts] = useState<Dict[]>([]);
    const [regex, setRegex] = useState<RegexPat[]>([]);
    const [incidents, setIncidents] = useState<Incident[]>([]);
    const [userRisk, setUserRisk] = useState<UserRisk[]>([]);
    const [compliance, setCompliance] = useState<Compliance[]>([]);
    const [usbEvents, setUsbEvents] = useState<UsbEvent[]>([]);
    const [clipEvents, setClipEvents] = useState<ClipEvent[]>([]);
    const [printEvents, setPrintEvents] = useState<PrintEvent[]>([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [regexTest, setRegexTest] = useState({ pattern: "", text: "", result: null as any });
    const [scanText, setScanText] = useState("");
    const [scanResult, setScanResult] = useState<any>(null);

    const [newDict, setNewDict] = useState({ name: "", description: "", category: "Custom", keywords: "", weight: 5, case_sensitive: false, proximity_words: 0 });
    const [newRegex, setNewRegex] = useState({ name: "", description: "", pattern: "", category: "Custom", severity: "Medium", test_sample: "" });

    const fetchAll = useCallback(async () => {
        setLoading(true);
        try {
            const [s, d, r, i, u, c, usb, clip, pr] = await Promise.all([
                fetch("/api/dlp/stats").then(r => r.ok ? r.json() : null),
                fetch("/api/dlp/dictionaries").then(r => r.ok ? r.json() : []),
                fetch("/api/dlp/regex").then(r => r.ok ? r.json() : []),
                fetch("/api/dlp/incidents").then(r => r.ok ? r.json() : []),
                fetch("/api/dlp/user-risk").then(r => r.ok ? r.json() : []),
                fetch("/api/dlp/compliance").then(r => r.ok ? r.json() : []),
                fetch("/api/dlp/usb-events").then(r => r.ok ? r.json() : []),
                fetch("/api/dlp/clipboard-events").then(r => r.ok ? r.json() : []),
                fetch("/api/dlp/print-events").then(r => r.ok ? r.json() : []),
            ]);
            if (s) setStats(s);
            setDicts(d); setRegex(r); setIncidents(i); setUserRisk(u); setCompliance(c);
            setUsbEvents(usb); setClipEvents(clip); setPrintEvents(pr);
        } catch (e) { console.error(e); }
        setLoading(false);
    }, []);

    useEffect(() => { fetchAll(); }, [fetchAll]);

    const addDict = async () => {
        if (!newDict.name || !newDict.keywords) return;
        await fetch("/api/dlp/dictionaries", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(newDict) });
        setNewDict({ name: "", description: "", category: "Custom", keywords: "", weight: 5, case_sensitive: false, proximity_words: 0 });
        setShowForm(false); fetchAll();
    };
    const delDict = async (id: number) => { await fetch(`/api/dlp/dictionaries/${id}`, { method: "DELETE" }); fetchAll(); };

    const addRegex = async () => {
        if (!newRegex.name || !newRegex.pattern) return;
        const res = await fetch("/api/dlp/regex", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(newRegex) });
        if (res.ok) { setNewRegex({ name: "", description: "", pattern: "", category: "Custom", severity: "Medium", test_sample: "" }); setShowForm(false); fetchAll(); }
    };
    const delRegex = async (id: number) => { await fetch(`/api/dlp/regex/${id}`, { method: "DELETE" }); fetchAll(); };

    const testRegex = async () => {
        const res = await fetch("/api/dlp/regex/test", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pattern: regexTest.pattern, text: regexTest.text }) });
        setRegexTest({ ...regexTest, result: await res.json() });
    };

    const runScan = async () => {
        if (!scanText) return;
        const res = await fetch("/api/dlp/scan", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: scanText }) });
        setScanResult(await res.json());
    };

    const updateIncident = async (id: number, status: string) => {
        await fetch(`/api/dlp/incidents/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
        fetchAll();
    };

    const toggleWatchlist = async (hostname: string, current: number) => {
        await fetch(`/api/dlp/user-risk/${hostname}/watchlist`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ watchlist: !current }) });
        fetchAll();
    };

    const toggleCompliance = async (id: number, current: string) => {
        await fetch(`/api/dlp/compliance/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: current === "Active" ? "Draft" : "Active" }) });
        fetchAll();
    };

    if (loading) return <div className="flex items-center justify-center h-96"><Loader2 className="w-8 h-8 animate-spin text-[#10b981]" /></div>;

    return (
        <div className="space-y-6 animate-in fade-in duration-700 pb-20">
            {/* Header */}
            <div className="border-b border-white/5 pb-8">
                <div className="flex items-center gap-3 mb-2">
                    <div className="w-1.5 h-1.5 bg-[#10b981]" />
                    <span className="text-[10px] font-black text-[#10b981] uppercase tracking-[0.4em]">Enterprise DLP Engine v7.0</span>
                </div>
                <h1 className="text-4xl font-black tracking-tighter text-white uppercase italic">Data<span className="text-[#10b981]">Shield</span></h1>
                <p className="text-gray-600 font-bold text-xs uppercase tracking-[0.2em] mt-2">Content-Aware Protection • Device Control • Threat Analytics • Compliance</p>
            </div>

            {/* Overview Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-1">
                <StatCard label="Open Incidents" value={stats?.openIncidents ?? 0} icon={AlertOctagon} accent="#ef4444" />
                <StatCard label="Today" value={stats?.todayIncidents ?? 0} icon={Zap} accent="#f59e0b" />
                <StatCard label="Dictionaries" value={stats?.activeDictionaries ?? 0} icon={BookOpen} accent="#10b981" />
                <StatCard label="Regex Rules" value={stats?.activeRegex ?? 0} icon={Fingerprint} accent="#3b82f6" />
                <StatCard label="High Risk Users" value={stats?.highRiskUsers ?? 0} icon={Users} accent="#ef4444" />
                <StatCard label="USB Events 24h" value={stats?.usbEvents ?? 0} icon={Usb} accent="#8b5cf6" />
            </div>

            {/* Tabs */}
            <div className="flex gap-1 border-b border-white/5 pb-0">
                {TABS.map(t => (
                    <button key={t.id} onClick={() => setTab(t.id)}
                        className={`flex items-center gap-2 px-5 py-3.5 text-[10px] font-black uppercase tracking-[0.2em] transition-all border-b-2 ${tab === t.id ? "text-white border-[#10b981] bg-white/[0.03]" : "text-gray-600 border-transparent hover:text-white hover:bg-white/[0.02]"}`}>
                        <t.icon className="w-3.5 h-3.5" style={{ color: tab === t.id ? t.color : undefined }} />
                        {t.label}
                    </button>
                ))}
            </div>

            {/* TAB 1: CONTENT INTELLIGENCE */}
            {tab === "content" && (
                <div className="space-y-6">
                    <SectionHeader title="Smart Content Scanner" subtitle="Keyword dictionaries, regex patterns, and real-time content scanning" icon={Fingerprint} color="#10b981" />

                    {/* Content Scan Tool */}
                    <div className="border border-[#10b981]/20 bg-[#10b981]/[0.02] p-6 space-y-4">
                        <h3 className="text-[10px] font-black text-[#10b981] uppercase tracking-[0.3em] flex items-center gap-2"><SearchIcon className="w-3.5 h-3.5" /> Live Content Scanner</h3>
                        <textarea value={scanText} onChange={e => setScanText(e.target.value)} placeholder="Paste text here to scan against all active dictionaries and regex patterns..." className="w-full h-24 bg-black/30 border border-white/10 p-4 text-[11px] font-mono text-white/80 outline-none focus:border-[#10b981]/50" />
                        <div className="flex items-center gap-4">
                            <button onClick={runScan} className="px-8 py-3 bg-[#10b981] text-black font-black text-[10px] uppercase tracking-widest hover:bg-[#10b981]/80"><SearchIcon className="w-3 h-3 inline mr-2" />Scan Now</button>
                            {scanResult && <span className="text-[10px] font-black uppercase tracking-widest" style={{ color: scanResult.risk_score > 50 ? "#ef4444" : scanResult.risk_score > 20 ? "#f59e0b" : "#10b981" }}>Risk Score: {scanResult.risk_score}/100 • {scanResult.matches.length} matches</span>}
                        </div>
                        {scanResult?.matches?.length > 0 && (
                            <div className="grid gap-2 mt-2">{scanResult.matches.map((m: any, i: number) => (
                                <div key={i} className="flex items-center gap-3 px-4 py-2 bg-black/30 border border-white/5 text-[10px]">
                                    <span className={`px-2 py-0.5 border font-black uppercase ${m.type === "regex" ? "bg-blue-500/10 border-blue-500/20 text-blue-400" : "bg-amber-500/10 border-amber-500/20 text-amber-400"}`}>{m.type}</span>
                                    <span className="text-white font-bold">{m.dictionary || m.pattern_name}</span>
                                    <span className="text-gray-500">→</span>
                                    <span className="text-[#10b981] font-mono">{m.keyword || (m.matches?.[0])}</span>
                                    <span className="ml-auto text-gray-600">weight: {m.weight || m.count}</span>
                                </div>
                            ))}</div>
                        )}
                    </div>

                    {/* Dictionaries */}
                    <div className="border border-white/5 bg-white/[0.01]">
                        <div className="p-5 bg-black/40 border-b border-white/5 flex items-center justify-between">
                            <span className="text-[10px] font-black text-white uppercase tracking-widest flex items-center gap-2"><BookOpen className="w-3.5 h-3.5 text-[#10b981]" /> Keyword Dictionaries ({dicts.length})</span>
                            <button onClick={() => setShowForm(showForm === true ? false : true)} className="px-4 py-2 bg-white/5 border border-white/10 text-[9px] font-black text-white uppercase tracking-widest hover:bg-[#10b981]/20"><Plus className="w-3 h-3 inline mr-1" />Add</button>
                        </div>
                        {showForm && tab === "content" && (
                            <div className="p-5 border-b border-white/5 bg-[#10b981]/[0.02] space-y-4">
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                    <Input label="Dictionary Name" value={newDict.name} onChange={v => setNewDict({ ...newDict, name: v })} placeholder="e.g., PII Data" />
                                    <Select label="Category" value={newDict.category} onChange={v => setNewDict({ ...newDict, category: v })} options={["Custom", "PII", "Financial", "Healthcare", "Business", "HR", "Technology", "Legal"]} />
                                    <Input label="Weight (1-10)" value={String(newDict.weight)} onChange={v => setNewDict({ ...newDict, weight: parseInt(v) || 5 })} placeholder="5" />
                                    <Input label="Proximity Words" value={String(newDict.proximity_words)} onChange={v => setNewDict({ ...newDict, proximity_words: parseInt(v) || 0 })} placeholder="0" />
                                </div>
                                <Input label="Keywords (comma-separated)" value={newDict.keywords} onChange={v => setNewDict({ ...newDict, keywords: v })} placeholder="ssn, social security, passport number" />
                                <button onClick={addDict} className="px-8 py-3 bg-[#10b981] text-black font-black text-[10px] uppercase tracking-widest"><Save className="w-3 h-3 inline mr-2" />Save Dictionary</button>
                            </div>
                        )}
                        <div className="divide-y divide-white/5">
                            {dicts.map(d => (
                                <div key={d.id} className="px-5 py-4 hover:bg-white/[0.02] transition-colors group">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 border border-[#10b981]/30 flex items-center justify-center"><BookOpen className="w-3.5 h-3.5 text-[#10b981]" /></div>
                                            <div>
                                                <p className="text-[11px] font-black text-white uppercase tracking-tight">{d.name}</p>
                                                <p className="text-[9px] text-gray-600">{d.category} • Weight: {d.weight}/10 • {d.keywords.split(",").length} keywords</p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <span className={`text-[8px] px-2 py-0.5 border font-black uppercase ${d.status === "Active" ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30" : "bg-gray-500/10 text-gray-500 border-gray-500/30"}`}>{d.status}</span>
                                            <button onClick={() => delDict(d.id)} className="text-red-700 hover:text-red-400 opacity-0 group-hover:opacity-100 transition"><Trash2 className="w-3.5 h-3.5" /></button>
                                        </div>
                                    </div>
                                    <div className="flex flex-wrap gap-1.5 mt-2">{d.keywords.split(",").slice(0, 8).map((k, i) => <span key={i} className="text-[8px] px-2 py-0.5 bg-white/5 border border-white/10 text-gray-400 font-mono">{k.trim()}</span>)}{d.keywords.split(",").length > 8 && <span className="text-[8px] px-2 py-0.5 text-gray-600">+{d.keywords.split(",").length - 8} more</span>}</div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Regex Patterns */}
                    <div className="border border-white/5 bg-white/[0.01]">
                        <div className="p-5 bg-black/40 border-b border-white/5 flex items-center justify-between">
                            <span className="text-[10px] font-black text-white uppercase tracking-widest flex items-center gap-2"><Fingerprint className="w-3.5 h-3.5 text-[#3b82f6]" /> Regex Pattern Library ({regex.length})</span>
                            <button onClick={() => setShowForm(!showForm)} className="px-4 py-2 bg-white/5 border border-white/10 text-[9px] font-black text-white uppercase tracking-widest hover:bg-[#3b82f6]/20"><Plus className="w-3 h-3 inline mr-1" />Add</button>
                        </div>
                        {/* Regex Test Lab */}
                        <div className="p-5 border-b border-white/5 bg-blue-500/[0.02] space-y-3">
                            <h4 className="text-[9px] font-black text-blue-400 uppercase tracking-[0.3em]">🧪 Regex Test Lab</h4>
                            <div className="grid grid-cols-2 gap-3">
                                <Input label="Pattern" value={regexTest.pattern} onChange={v => setRegexTest({ ...regexTest, pattern: v })} placeholder="\\b\\d{3}-\\d{2}-\\d{4}\\b" />
                                <Input label="Test Text" value={regexTest.text} onChange={v => setRegexTest({ ...regexTest, text: v })} placeholder="My SSN is 123-45-6789" />
                            </div>
                            <div className="flex items-center gap-4">
                                <button onClick={testRegex} className="px-6 py-2 bg-[#3b82f6] text-white font-black text-[9px] uppercase tracking-widest">Test</button>
                                {regexTest.result && <span className={`text-[10px] font-black uppercase ${regexTest.result.valid ? "text-emerald-400" : "text-red-400"}`}>{regexTest.result.valid ? `✓ ${regexTest.result.count} matches` : `✗ ${regexTest.result.error}`}</span>}
                            </div>
                        </div>
                        <div className="divide-y divide-white/5">
                            {regex.map(r => (
                                <div key={r.id} className="px-5 py-3 hover:bg-white/[0.02] transition-colors group flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className="w-7 h-7 border border-blue-500/30 flex items-center justify-center"><Fingerprint className="w-3 h-3 text-blue-400" /></div>
                                        <div>
                                            <p className="text-[10px] font-black text-white uppercase tracking-tight">{r.name}</p>
                                            <p className="text-[8px] text-gray-600 font-mono truncate max-w-[300px]">{r.pattern}</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className="text-[8px] text-gray-500 font-mono">{r.category}</span>
                                        <span className={`text-[8px] px-2 py-0.5 border font-black uppercase ${getSevColor(r.severity)}`}>{r.severity}</span>
                                        <button onClick={() => delRegex(r.id)} className="text-red-700 hover:text-red-400 opacity-0 group-hover:opacity-100 transition"><Trash2 className="w-3 h-3" /></button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* TAB 2: ENDPOINT SHIELD */}
            {tab === "endpoint" && (
                <div className="space-y-6">
                    <SectionHeader title="Device & Endpoint Guard" subtitle="USB devices, clipboard operations, print jobs, and file activity monitoring" icon={Shield} color="#3b82f6" />

                    <div className="grid grid-cols-3 gap-1">
                        <StatCard label="USB Events 24h" value={usbEvents.length} icon={Usb} accent="#8b5cf6" />
                        <StatCard label="Clipboard Blocked" value={stats?.clipboardBlocked ?? 0} icon={Clipboard} accent="#ef4444" />
                        <StatCard label="Print Jobs 24h" value={printEvents.length} icon={Printer} accent="#f59e0b" />
                    </div>

                    {/* USB Device Log */}
                    <DataTable title="USB Device Events" icon={Usb} color="#8b5cf6" count={usbEvents.length}
                        headers={["Time", "Device", "Host", "Type", "Action", "Policy"]}>
                        {usbEvents.slice(0, 50).map(e => (
                            <tr key={e.id} className="hover:bg-white/[0.02] border-b border-white/5">
                                <Cell>{new Date(e.timestamp).toLocaleString()}</Cell>
                                <Cell bold>{e.device_name || "Unknown"}</Cell>
                                <Cell>{e.hostname}</Cell>
                                <Cell>{e.device_type}</Cell>
                                <Cell>{e.action}</Cell>
                                <Cell><span className={`text-[8px] px-2 py-0.5 border font-black uppercase ${e.policy_action === "Blocked" ? "bg-red-500/10 text-red-400 border-red-500/30" : "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"}`}>{e.policy_action || "Allowed"}</span></Cell>
                            </tr>
                        ))}
                    </DataTable>

                    {/* Clipboard Events */}
                    <DataTable title="Clipboard Monitor" icon={Clipboard} color="#ef4444" count={clipEvents.length}
                        headers={["Time", "Host", "Action", "Source App", "Preview", "Blocked"]}>
                        {clipEvents.slice(0, 50).map(e => (
                            <tr key={e.id} className="hover:bg-white/[0.02] border-b border-white/5">
                                <Cell>{new Date(e.timestamp).toLocaleString()}</Cell>
                                <Cell bold>{e.hostname}</Cell>
                                <Cell>{e.action}</Cell>
                                <Cell>{e.source_app || "—"}</Cell>
                                <Cell><span className="font-mono text-gray-500 truncate max-w-[200px] inline-block">{e.content_preview?.substring(0, 40) || "—"}</span></Cell>
                                <Cell>{e.blocked ? <span className="text-red-400 font-black">BLOCKED</span> : <span className="text-emerald-400">OK</span>}</Cell>
                            </tr>
                        ))}
                    </DataTable>

                    {/* Print Events */}
                    <DataTable title="Print Job Monitor" icon={Printer} color="#f59e0b" count={printEvents.length}
                        headers={["Time", "Host", "Document", "Printer", "Pages", "Status"]}>
                        {printEvents.slice(0, 50).map(e => (
                            <tr key={e.id} className="hover:bg-white/[0.02] border-b border-white/5">
                                <Cell>{new Date(e.timestamp).toLocaleString()}</Cell>
                                <Cell bold>{e.hostname}</Cell>
                                <Cell>{e.document_name || "—"}</Cell>
                                <Cell>{e.printer_name || "—"}</Cell>
                                <Cell>{e.pages}</Cell>
                                <Cell>{e.blocked ? <span className="text-red-400 font-black">BLOCKED</span> : <span className="text-emerald-400">Printed</span>}</Cell>
                            </tr>
                        ))}
                    </DataTable>
                </div>
            )}

            {/* TAB 3: NETWORK SENTINEL */}
            {tab === "network" && (
                <div className="space-y-6">
                    <SectionHeader title="Network Data Watchdog" subtitle="DLP incidents across all channels — email, web, cloud, USB, and more" icon={Globe} color="#8b5cf6" />

                    {stats?.byChannel && stats.byChannel.length > 0 && (
                        <div className="border border-white/5 bg-white/[0.01] p-6">
                            <h3 className="text-[10px] font-black text-white uppercase tracking-widest mb-4">Incidents by Channel</h3>
                            <div className="flex gap-2 flex-wrap">{stats.byChannel.map((c, i) => (
                                <div key={i} className="px-4 py-3 border border-white/10 bg-white/[0.02] text-center min-w-[100px]">
                                    <p className="text-2xl font-black text-[#8b5cf6]">{c.count}</p>
                                    <p className="text-[8px] font-black text-gray-600 uppercase tracking-widest mt-1">{c.channel || "Unknown"}</p>
                                </div>
                            ))}</div>
                        </div>
                    )}

                    <DataTable title="DLP Incident Feed" icon={AlertTriangle} color="#8b5cf6" count={incidents.length}
                        headers={["Time", "Host", "Type", "Channel", "Policy", "Severity", "Status", "Action"]}>
                        {incidents.slice(0, 100).map(inc => (
                            <tr key={inc.id} className="hover:bg-white/[0.02] border-b border-white/5">
                                <Cell>{new Date(inc.timestamp).toLocaleString()}</Cell>
                                <Cell bold>{inc.hostname}</Cell>
                                <Cell>{inc.incident_type || "—"}</Cell>
                                <Cell>{inc.channel || "—"}</Cell>
                                <Cell>{inc.policy_name || "—"}</Cell>
                                <Cell><span className={`text-[8px] px-2 py-0.5 border font-black uppercase ${getSevColor(inc.severity)}`}>{inc.severity}</span></Cell>
                                <Cell><span className={`text-[8px] font-black uppercase ${inc.status === "Open" ? "text-red-400" : inc.status === "Investigating" ? "text-amber-400" : "text-emerald-400"}`}>{inc.status}</span></Cell>
                                <Cell>
                                    {inc.status === "Open" && (
                                        <div className="flex gap-1">
                                            <button onClick={() => updateIncident(inc.id, "Investigating")} className="text-[8px] px-2 py-1 bg-amber-500/10 border border-amber-500/20 text-amber-400 font-black uppercase hover:bg-amber-500/20">Investigate</button>
                                            <button onClick={() => updateIncident(inc.id, "Dismissed")} className="text-[8px] px-2 py-1 bg-gray-500/10 border border-gray-500/20 text-gray-400 font-black uppercase hover:bg-gray-500/20">Dismiss</button>
                                        </div>
                                    )}
                                    {inc.status === "Investigating" && (
                                        <button onClick={() => updateIncident(inc.id, "Resolved")} className="text-[8px] px-2 py-1 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-black uppercase hover:bg-emerald-500/20">Resolve</button>
                                    )}
                                </Cell>
                            </tr>
                        ))}
                    </DataTable>
                </div>
            )}

            {/* TAB 4: THREAT ANALYTICS */}
            {tab === "threats" && (
                <div className="space-y-6">
                    <SectionHeader title="Risk & Behavior Analytics" subtitle="User risk scoring, insider threat indicators, and behavioral analysis" icon={AlertOctagon} color="#ef4444" />

                    <div className="grid grid-cols-3 gap-1">
                        <StatCard label="High Risk Users" value={stats?.highRiskUsers ?? 0} icon={Users} accent="#ef4444" />
                        <StatCard label="On Watchlist" value={stats?.watchlistUsers ?? 0} icon={Eye} accent="#f59e0b" />
                        <StatCard label="Total Incidents" value={stats?.totalIncidents ?? 0} icon={AlertTriangle} accent="#8b5cf6" />
                    </div>

                    {/* Top Policies */}
                    {stats?.topPolicies && stats.topPolicies.length > 0 && (
                        <div className="border border-white/5 bg-white/[0.01] p-6">
                            <h3 className="text-[10px] font-black text-white uppercase tracking-widest mb-4">Top Triggered Policies</h3>
                            <div className="space-y-2">{stats.topPolicies.map((p, i) => (
                                <div key={i} className="flex items-center gap-4 px-4 py-2 bg-black/30 border border-white/5">
                                    <span className="text-[10px] font-black text-gray-600 w-6">#{i + 1}</span>
                                    <span className="text-[10px] font-black text-white flex-1">{p.policy_name || "Unknown"}</span>
                                    <span className="text-[10px] font-black text-[#ef4444]">{p.count} hits</span>
                                </div>
                            ))}</div>
                        </div>
                    )}

                    {/* User Risk Table */}
                    <DataTable title="User Risk Scoreboard" icon={Users} color="#ef4444" count={userRisk.length}
                        headers={["User", "Host", "Risk Score", "Level", "Incidents", "Critical", "Watchlist", "Last Incident"]}>
                        {userRisk.map(u => (
                            <tr key={u.hostname} className="hover:bg-white/[0.02] border-b border-white/5">
                                <Cell bold>{u.username || "—"}</Cell>
                                <Cell>{u.hostname}</Cell>
                                <Cell>
                                    <div className="flex items-center gap-2">
                                        <div className="w-16 h-1.5 bg-white/5 overflow-hidden"><div className="h-full transition-all" style={{ width: `${u.risk_score}%`, backgroundColor: getRiskColor(u.risk_level) }} /></div>
                                        <span className="text-[10px] font-black" style={{ color: getRiskColor(u.risk_level) }}>{u.risk_score.toFixed(0)}</span>
                                    </div>
                                </Cell>
                                <Cell><span className={`text-[8px] px-2 py-0.5 border font-black uppercase ${getSevColor(u.risk_level)}`}>{u.risk_level}</span></Cell>
                                <Cell>{u.total_incidents}</Cell>
                                <Cell><span className="text-red-400 font-black">{u.critical_incidents}</span></Cell>
                                <Cell>
                                    <button onClick={() => toggleWatchlist(u.hostname, u.watchlist)} className={`text-[9px] font-black uppercase px-3 py-1 border transition-all ${u.watchlist ? "bg-red-500/10 border-red-500/30 text-red-400" : "bg-white/5 border-white/10 text-gray-600 hover:text-white"}`}>
                                        {u.watchlist ? "★ Watching" : "Watch"}
                                    </button>
                                </Cell>
                                <Cell>{u.last_incident ? new Date(u.last_incident).toLocaleDateString() : "—"}</Cell>
                            </tr>
                        ))}
                    </DataTable>
                </div>
            )}

            {/* TAB 5: COMPLIANCE CENTER */}
            {tab === "compliance" && (
                <div className="space-y-6">
                    <SectionHeader title="Compliance & Reporting Hub" subtitle="Regulatory compliance templates, audit trails, and enterprise reporting" icon={BookOpen} color="#f59e0b" />

                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                        {compliance.map(c => {
                            let rules: string[] = [], controls: string[] = [];
                            try { rules = JSON.parse(c.rules || "[]"); } catch { }
                            try { controls = JSON.parse(c.controls || "[]"); } catch { }
                            return (
                                <div key={c.id} className="border border-white/5 bg-white/[0.01] p-6 space-y-4 hover:border-[#f59e0b]/20 transition-all">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 border border-[#f59e0b]/30 flex items-center justify-center"><FileText className="w-4 h-4 text-[#f59e0b]" /></div>
                                            <div>
                                                <p className="text-[12px] font-black text-white uppercase tracking-tight">{c.framework}</p>
                                                <p className="text-[9px] text-gray-600">{c.name}</p>
                                            </div>
                                        </div>
                                        <button onClick={() => toggleCompliance(c.id, c.status)}
                                            className={`text-[8px] font-black uppercase px-3 py-1.5 border transition-all ${c.status === "Active" ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400" : "bg-white/5 border-white/10 text-gray-600 hover:text-white"}`}>
                                            {c.status === "Active" ? "Active" : "Enable"}
                                        </button>
                                    </div>
                                    <p className="text-[9px] text-gray-500 leading-relaxed">{c.description}</p>
                                    <div>
                                        <p className="text-[8px] font-black text-gray-600 uppercase tracking-widest mb-2">Rules</p>
                                        <div className="flex flex-wrap gap-1">{rules.map((r, i) => <span key={i} className="text-[7px] px-2 py-0.5 bg-[#f59e0b]/5 border border-[#f59e0b]/20 text-[#f59e0b]/70 font-bold">{r}</span>)}</div>
                                    </div>
                                    <div>
                                        <p className="text-[8px] font-black text-gray-600 uppercase tracking-widest mb-2">Controls</p>
                                        <div className="flex flex-wrap gap-1">{controls.map((c2, i) => <span key={i} className="text-[7px] px-2 py-0.5 bg-white/5 border border-white/10 text-gray-500 font-bold">{c2}</span>)}</div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {/* Incident Severity Breakdown */}
                    {stats?.bySeverity && stats.bySeverity.length > 0 && (
                        <div className="border border-white/5 bg-white/[0.01] p-6">
                            <h3 className="text-[10px] font-black text-white uppercase tracking-widest mb-4">Incident Severity Breakdown (30 Days)</h3>
                            <div className="flex gap-4">{stats.bySeverity.map((s, i) => (
                                <div key={i} className="flex-1 text-center px-4 py-4 border border-white/5 bg-black/30">
                                    <p className="text-3xl font-black" style={{ color: getRiskColor(s.severity) }}>{s.count}</p>
                                    <p className="text-[8px] font-black uppercase tracking-widest mt-1 text-gray-600">{s.severity}</p>
                                </div>
                            ))}</div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

function SectionHeader({ title, subtitle, icon: Icon, color }: { title: string; subtitle: string; icon: any; color: string }) {
    return (
        <div className="flex items-center gap-4 py-2">
            <div className="w-10 h-10 border flex items-center justify-center" style={{ borderColor: `${color}40` }}><Icon className="w-5 h-5" style={{ color }} /></div>
            <div>
                <h2 className="text-lg font-black text-white uppercase tracking-tight italic">{title}</h2>
                <p className="text-[9px] text-gray-600 uppercase tracking-widest">{subtitle}</p>
            </div>
        </div>
    );
}

function StatCard({ label, value, icon: Icon, accent }: { label: string; value: number; icon: any; accent: string }) {
    return (
        <div className="p-5 border border-white/5 bg-white/[0.01] hover:bg-white/[0.02] transition-all">
            <div className="flex justify-between items-start mb-3">
                <p className="text-[8px] font-black text-gray-600 uppercase tracking-[0.3em]">{label}</p>
                <Icon className="w-3.5 h-3.5 opacity-30" style={{ color: accent }} />
            </div>
            <h3 className="text-2xl font-black tracking-tighter italic" style={{ color: accent }}>{value}</h3>
        </div>
    );
}

function DataTable({ title, icon: Icon, color, count, headers, children }: { title: string; icon: any; color: string; count: number; headers: string[]; children: React.ReactNode }) {
    return (
        <div className="border border-white/5 bg-white/[0.01]">
            <div className="p-5 bg-black/40 border-b border-white/5 flex items-center gap-3">
                <Icon className="w-4 h-4" style={{ color }} />
                <span className="text-[10px] font-black text-white uppercase tracking-widest">{title}</span>
                <span className="text-[9px] font-black text-gray-700 uppercase tracking-widest ml-auto">{count} records</span>
            </div>
            <div className="overflow-x-auto">
                <table className="w-full text-left">
                    <thead className="border-b border-white/5">
                        <tr>{headers.map(h => <th key={h} className="px-4 py-3 text-[8px] font-black text-gray-600 uppercase tracking-[0.3em]">{h}</th>)}</tr>
                    </thead>
                    <tbody>{children}</tbody>
                </table>
                {count === 0 && <div className="py-12 text-center text-gray-700 text-[10px] font-black uppercase tracking-widest">No data recorded yet</div>}
            </div>
        </div>
    );
}

function Cell({ children, bold }: { children: React.ReactNode; bold?: boolean }) {
    return <td className={`px-4 py-3 text-[10px] ${bold ? "font-black text-white" : "text-gray-500"}`}>{children}</td>;
}

function Input({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder: string }) {
    return (
        <div className="space-y-1.5">
            <label className="text-[8px] font-black text-gray-600 uppercase tracking-[0.3em]">{label}</label>
            <input type="text" value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
                className="w-full bg-white/[0.03] border border-white/10 px-3 py-2.5 text-[10px] font-bold text-white outline-none focus:border-[#10b981]/50" />
        </div>
    );
}

function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: string[] }) {
    return (
        <div className="space-y-1.5">
            <label className="text-[8px] font-black text-gray-600 uppercase tracking-[0.3em]">{label}</label>
            <select value={value} onChange={e => onChange(e.target.value)}
                className="w-full bg-white/[0.03] border border-white/10 px-3 py-2.5 text-[10px] font-bold text-white outline-none focus:border-[#10b981]/50 uppercase appearance-none cursor-pointer">
                {options.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
        </div>
    );
}
