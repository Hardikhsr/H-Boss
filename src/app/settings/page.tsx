"use client";

import { useEffect, useState, useCallback } from "react";
import {
    Settings, Save, RefreshCw, Loader2, Shield, Bell, Database,
    Cpu, Globe, Clock, Eye, Key, AlertTriangle, CheckCircle, Activity
} from "lucide-react";
import { toast } from "sonner";

const TABS = [
    { id: "general", label: "General", icon: Settings },
    { id: "trigger", label: "Trigger Engine", icon: Activity },
    { id: "lockdown", label: "Lockdown Screen", icon: Key },
    { id: "alerts", label: "Alert Triggers", icon: Bell },
    { id: "dlp", label: "DLP Vectors", icon: Shield },
    { id: "storage", label: "Storage Vault", icon: Database },
    { id: "agent", label: "Agent Config", icon: Cpu },
];

export default function SettingsPage() {
    const [settings, setSettings] = useState<Record<string, string>>({});
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [activeTab, setActiveTab] = useState("general");
    const [dirty, setDirty] = useState(false);

    const fetchSettings = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch("/api/settings");
            const data = await res.json();
            setSettings(data);
            setDirty(false);
        } catch (e) { console.error(e); }
        finally { setLoading(false); }
    }, []);

    useEffect(() => { fetchSettings(); }, [fetchSettings]);

    const updateSetting = (key: string, value: string) => {
        setSettings(prev => ({ ...prev, [key]: value }));
        setDirty(true);
    };

    const saveSettings = async () => {
        setSaving(true);
        try {
            const res = await fetch("/api/settings", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(settings)
            });
            const data = await res.json();
            if (data.success) {
                toast.success(`Settings saved (${data.updated} updated)`);
                setDirty(false);
            }
        } catch (e) {
            toast.error("Failed to save settings");
        } finally {
            setSaving(false);
        }
    };

    const Field = ({ label, settingKey, type = "text", placeholder = "", help = "" }: { label: string; settingKey: string; type?: string; placeholder?: string; help?: string }) => (
        <div className="space-y-2">
            <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest block">{label}</label>
            {type === "textarea" ? (
                <textarea value={settings[settingKey] || ""} onChange={e => updateSetting(settingKey, e.target.value)}
                    placeholder={placeholder}
                    className="w-full bg-white/[0.03] border border-white/10 p-4 text-sm text-white outline-none focus:border-[#10b981]/50 min-h-[100px] resize-none font-mono" />
            ) : type === "toggle" ? (
                <button onClick={() => updateSetting(settingKey, settings[settingKey] === "true" ? "false" : "true")}
                    className={`w-14 h-7 rounded-full transition-all relative ${settings[settingKey] === "true" ? "bg-[#10b981]" : "bg-white/10"}`}>
                    <div className={`w-5 h-5 bg-white rounded-full absolute top-1 transition-all ${settings[settingKey] === "true" ? "left-8" : "left-1"}`} />
                </button>
            ) : type === "select" ? null : (
                <input type={type} value={settings[settingKey] || ""} onChange={e => updateSetting(settingKey, e.target.value)}
                    placeholder={placeholder}
                    className="w-full bg-white/[0.03] border border-white/10 px-4 py-3 text-sm text-white outline-none focus:border-[#10b981]/50 font-mono" />
            )}
            {help && <p className="text-[9px] text-gray-700 font-bold">{help}</p>}
        </div>
    );

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[600px] space-y-6">
                <Loader2 className="w-16 h-16 animate-spin text-[#10b981]" />
                <p className="text-[10px] font-black text-gray-600 uppercase tracking-[0.5em]">Loading Configuration...</p>
            </div>
        );
    }

    return (
        <div className="space-y-8 animate-in fade-in duration-700 pb-20">
            {/* Header */}
            <div className="flex justify-between items-end border-b border-white/5 pb-10">
                <div className="space-y-4">
                    <div className="flex items-center gap-3">
                        <div className="w-1.5 h-1.5 bg-[#10b981]" />
                        <span className="text-[10px] font-black text-[#10b981] uppercase tracking-[0.4em]">System Configuration</span>
                    </div>
                    <h1 className="text-5xl font-black tracking-tighter text-white uppercase italic">Config<span className="text-[#10b981]">Hub</span></h1>
                </div>
                <div className="flex gap-3">
                    <button onClick={fetchSettings}
                        className="px-6 py-3 border border-white/10 text-gray-400 font-black text-[10px] uppercase tracking-[0.2em] hover:border-white/30 transition-all flex items-center gap-2">
                        <RefreshCw className="w-3 h-3" /> Reset
                    </button>
                    <button onClick={saveSettings} disabled={!dirty}
                        className={`px-8 py-3 font-black text-[10px] uppercase tracking-[0.2em] flex items-center gap-2 transition-all ${dirty ? "bg-[#10b981] text-black hover:bg-[#10b981]/80" : "bg-white/5 text-gray-600 cursor-not-allowed"}`}>
                        {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                        {saving ? "Saving..." : "Save All"}
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-12 gap-1">
                {/* Tabs Sidebar */}
                <div className="col-span-3 space-y-1">
                    {TABS.map(tab => (
                        <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                            className={`w-full flex items-center gap-4 px-6 py-4 border transition-all text-left ${activeTab === tab.id ? "border-[#10b981]/50 bg-[#10b981]/5 text-[#10b981]" : "border-white/5 text-gray-500 hover:text-white hover:bg-white/[0.02]"}`}>
                            <tab.icon className="w-4 h-4" />
                            <span className="text-[11px] font-black uppercase tracking-wider">{tab.label}</span>
                        </button>
                    ))}
                </div>

                {/* Settings Panel */}
                <div className="col-span-9 p-8 border border-white/5 bg-white/[0.01] min-h-[500px]">
                    {activeTab === "general" && (
                        <div className="space-y-8">
                            <h3 className="text-sm font-black text-white uppercase tracking-tight border-b border-white/5 pb-4">General Configuration</h3>
                            <div className="grid grid-cols-2 gap-6">
                                <Field label="Company Name" settingKey="company_name" placeholder="Your Company" />
                                <Field label="System Timezone" settingKey="timezone" placeholder="UTC" help="Timezone for server-side time display" />
                                <Field label="Work Start Time" settingKey="work_start_time" type="time" help="Default work day start" />
                                <Field label="Work End Time" settingKey="work_end_time" type="time" help="Default work day end" />
                                <Field label="Late Threshold (minutes)" settingKey="late_threshold_minutes" type="number" placeholder="30" help="Minutes after work_start to mark as late" />
                                <Field label="Data Retention (days)" settingKey="retention_days" type="number" placeholder="30" help="Auto-delete data & recordings older than this" />
                            </div>
                            <div>
                                <Field label="Risk Keywords" settingKey="risk_keywords" type="textarea" placeholder="keyword1, keyword2, ..."
                                    help="Comma-separated keywords that trigger alerts when found in OCR or window titles" />
                            </div>
                        </div>
                    )}

                    {activeTab === "trigger" && (
                        <div className="space-y-8">
                            <h3 className="text-sm font-black text-white uppercase tracking-tight border-b border-white/5 pb-4">Event-Triggered Recording Engine</h3>
                            <div>
                                <Field label="Remote Access Watchlist (RAT)" settingKey="trigger_rat_watchlist" type="textarea"
                                    placeholder="TeamViewer.exe, AnyDesk.exe, msra.exe..."
                                    help="Comma-separated process names. Detecting any of these will automatically trigger high-priority screen recording." />
                            </div>
                            <div>
                                <Field label="Sensitive Content Keywords" settingKey="trigger_content_keywords" type="textarea"
                                    placeholder="confidential, top secret, ssn, credit card..."
                                    help="Keywords that trigger a 2-minute recording session when typed or copied to clipboard." />
                            </div>
                            <div>
                                <Field label="Policy Violation Categories" settingKey="trigger_site_categories" placeholder="adult, gambling, piracy, darkweb"
                                    help="Comma-separated site/app category keywords that trigger policy violation recording sessions." />
                            </div>
                            <div className="grid grid-cols-3 gap-6">
                                <Field label="RAT Grace Period (seconds)" settingKey="trigger_rat_grace_seconds" type="number" placeholder="60" help="Recording continuation after RAT exits" />
                                <Field label="Content Session Duration (s)" settingKey="trigger_content_duration_seconds" type="number" placeholder="120" help="Duration for sensitive content sessions" />
                                <Field label="Pre-Event Buffer (seconds)" settingKey="trigger_buffer_seconds" type="number" placeholder="30" help="In-memory buffer saved before trigger point" />
                            </div>
                        </div>
                    )}

                    {activeTab === "lockdown" && (
                        <div className="space-y-8">
                            <h3 className="text-sm font-black text-white uppercase tracking-tight border-b border-white/5 pb-4">Lockdown / Blackout Screen Message</h3>
                            <div>
                                <Field label="Custom Support Message" settingKey="blackout_message" type="textarea"
                                    placeholder="Your device has been locked by your administrator."
                                    help="Displayed centered on the blackout overlay when a machine is locked or blacked out." />
                            </div>
                            <div className="grid grid-cols-3 gap-6">
                                <Field label="Support Phone" settingKey="blackout_contact_phone" placeholder="+1 (800) 555-0199" help="Displayed on lockdown screen" />
                                <Field label="Support Email" settingKey="blackout_contact_email" placeholder="security@company.com" help="Displayed on lockdown screen" />
                                <Field label="Support Portal URL" settingKey="blackout_contact_url" placeholder="https://support.company.com" help="Displayed on lockdown screen" />
                            </div>
                        </div>
                    )}

                    {activeTab === "alerts" && (
                        <div className="space-y-8">
                            <h3 className="text-sm font-black text-white uppercase tracking-tight border-b border-white/5 pb-4">Alert Configuration</h3>
                            <div className="grid grid-cols-2 gap-6">
                                <Field label="Notification Email" settingKey="alert_email" type="email" placeholder="admin@company.com" help="Email for critical alert notifications" />
                                <Field label="Webhook URL" settingKey="alert_webhook" placeholder="https://hooks.slack.com/..." help="Slack/Teams webhook for real-time alerts" />
                                <Field label="Auto-Dismiss After (hours)" settingKey="alert_auto_dismiss_hours" type="number" placeholder="72" help="Automatically dismiss old alerts" />
                            </div>
                            <div>
                                <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest block mb-2">Minimum Severity Threshold</label>
                                <div className="flex gap-2">
                                    {["Low", "Medium", "High", "Critical"].map(sev => (
                                        <button key={sev} onClick={() => updateSetting("alert_severity_threshold", sev)}
                                            className={`px-5 py-3 text-[10px] font-black uppercase tracking-wider border transition-all ${settings.alert_severity_threshold === sev ? "border-[#10b981]/50 bg-[#10b981]/10 text-[#10b981]" : "border-white/10 text-gray-600 hover:text-white"}`}>
                                            {sev}
                                        </button>
                                    ))}
                                </div>
                                <p className="text-[9px] text-gray-700 font-bold mt-2">Only alerts at or above this severity will trigger notifications</p>
                            </div>
                        </div>
                    )}

                    {activeTab === "dlp" && (
                        <div className="space-y-8">
                            <h3 className="text-sm font-black text-white uppercase tracking-tight border-b border-white/5 pb-4">DLP Vector Configuration</h3>
                            <div className="space-y-6">
                                <div className="flex items-center justify-between p-4 border border-white/5 bg-white/[0.02]">
                                    <div><p className="text-[11px] font-black text-white uppercase">Auto Content Scanning</p><p className="text-[9px] text-gray-600">Automatically scan OCR text against DLP dictionaries</p></div>
                                    <Field label="" settingKey="dlp_auto_scan" type="toggle" />
                                </div>
                                <div className="grid grid-cols-3 gap-6">
                                    <div>
                                        <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest block mb-2">Clipboard Policy</label>
                                        <div className="flex gap-2">
                                            {["Allow", "Alert", "Block"].map(p => (
                                                <button key={p} onClick={() => updateSetting("dlp_clipboard_policy", p)}
                                                    className={`flex-1 px-4 py-3 text-[10px] font-black uppercase border transition-all ${settings.dlp_clipboard_policy === p ? "border-[#10b981]/50 bg-[#10b981]/10 text-[#10b981]" : "border-white/10 text-gray-600"}`}>
                                                    {p}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest block mb-2">Print Policy</label>
                                        <div className="flex gap-2">
                                            {["Allow", "Alert", "Block"].map(p => (
                                                <button key={p} onClick={() => updateSetting("dlp_print_policy", p)}
                                                    className={`flex-1 px-4 py-3 text-[10px] font-black uppercase border transition-all ${settings.dlp_print_policy === p ? "border-[#10b981]/50 bg-[#10b981]/10 text-[#10b981]" : "border-white/10 text-gray-600"}`}>
                                                    {p}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest block mb-2">Network Policy</label>
                                        <div className="flex gap-2">
                                            {["Allow", "Alert", "Block"].map(p => (
                                                <button key={p} onClick={() => updateSetting("dlp_network_policy", p)}
                                                    className={`flex-1 px-4 py-3 text-[10px] font-black uppercase border transition-all ${settings.dlp_network_policy === p ? "border-[#10b981]/50 bg-[#10b981]/10 text-[#10b981]" : "border-white/10 text-gray-600"}`}>
                                                    {p}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                                <Field label="Scan Interval (seconds)" settingKey="dlp_scan_interval" type="number" placeholder="30" help="How often to run background DLP scans" />
                            </div>
                        </div>
                    )}

                    {activeTab === "storage" && (
                        <div className="space-y-8">
                            <h3 className="text-sm font-black text-white uppercase tracking-tight border-b border-white/5 pb-4">Storage Lifecycle & Purge Configuration</h3>
                            
                            <div className="grid grid-cols-2 gap-6">
                                <Field label="Auto Retention (Hours)" settingKey="retention_hours" type="number" placeholder="48" help="Auto-delete files and recordings older than this (48 hours = 2 days)" />
                                <Field label="Max Storage (GB)" settingKey="storage_max_gb" type="number" placeholder="50" help="Maximum disk usage threshold" />
                            </div>

                            <div className="flex flex-col gap-3 p-4 border border-white/5 bg-white/[0.02]">
                                <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest block">Quick Retention Presets</label>
                                <div className="flex gap-3">
                                    {[
                                        { label: "48 Hours (Default)", hours: "48", days: "2" },
                                        { label: "24 Hours (1 Day)", hours: "24", days: "1" },
                                        { label: "72 Hours (3 Days)", hours: "72", days: "3" },
                                        { label: "7 Days", hours: "168", days: "7" }
                                    ].map(preset => (
                                        <button key={preset.hours}
                                            onClick={() => { updateSetting("retention_hours", preset.hours); updateSetting("retention_days", preset.days); }}
                                            className={`px-4 py-2 text-[10px] font-mono border transition-all ${settings.retention_hours === preset.hours ? "border-[#10b981] bg-[#10b981]/10 text-[#10b981]" : "border-white/10 text-gray-400 hover:text-white"}`}>
                                            {preset.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="flex items-center justify-between p-4 border border-white/5 bg-white/[0.02]">
                                <div>
                                    <p className="text-[11px] font-black text-white uppercase">Automated Background Purge</p>
                                    <p className="text-[9px] text-gray-600">Hourly background worker automatically deletes files older than retention limit (e.g. 48 hrs)</p>
                                </div>
                                <Field label="" settingKey="storage_auto_cleanup" type="toggle" />
                            </div>

                            {/* Manual Cleanup Action */}
                            <div className="p-6 border border-emerald-500/20 bg-emerald-500/5 rounded-lg space-y-4">
                                <div>
                                    <h4 className="text-xs font-black text-emerald-400 uppercase tracking-wider">Instant Manual Storage Purge</h4>
                                    <p className="text-[10px] text-gray-400 font-mono mt-1">
                                        Trigger immediate manual cleanup of all recordings and screenshot frames older than {settings.retention_hours || "48"} hours right now.
                                    </p>
                                </div>
                                <button
                                    onClick={async () => {
                                        try {
                                            const res = await fetch("/api/storage/cleanup", {
                                                method: "POST",
                                                headers: { "Content-Type": "application/json" },
                                                body: JSON.stringify({ hours: parseFloat(settings.retention_hours || "48") })
                                            });
                                            const data = await res.json();
                                            if (data.success) {
                                                toast.success(`Manual Purge Complete! Cleaned ${data.deletedFiles} files & ${data.deletedRecords} database records (${data.hoursUsed}h cutoff).`);
                                            } else {
                                                toast.error("Cleanup failed: " + data.error);
                                            }
                                        } catch (e) {
                                            toast.error("Failed to run manual cleanup");
                                        }
                                    }}
                                    className="px-6 py-2.5 bg-[#10b981] hover:bg-[#10b981]/80 text-black font-black text-[10px] uppercase tracking-widest transition-all rounded"
                                >
                                    Purge Storage Now ({settings.retention_hours || "48"}h Cutoff)
                                </button>
                            </div>
                        </div>
                    )}

                    {activeTab === "agent" && (
                        <div className="space-y-8">
                            <h3 className="text-sm font-black text-white uppercase tracking-tight border-b border-white/5 pb-4">Agent Configuration</h3>
                            <div className="grid grid-cols-2 gap-6">
                                <Field label="Capture Interval (seconds)" settingKey="agent_capture_interval" type="number" placeholder="5" help="Screenshot interval in seconds" />
                                <Field label="Capture Quality (1-100)" settingKey="agent_capture_quality" type="number" placeholder="60" help="JPEG quality for screenshots" />
                            </div>
                            <div className="flex items-center justify-between p-4 border border-white/5 bg-white/[0.02]">
                                <div><p className="text-[11px] font-black text-white uppercase">Stealth Mode</p><p className="text-[9px] text-gray-600">Hide agent from Task Manager and system tray</p></div>
                                <Field label="" settingKey="agent_stealth_mode" type="toggle" />
                            </div>
                            <div className="flex items-center justify-between p-4 border border-white/5 bg-white/[0.02]">
                                <div><p className="text-[11px] font-black text-white uppercase">OCR Enabled</p><p className="text-[9px] text-gray-600">Run text recognition on captured screens</p></div>
                                <Field label="" settingKey="ocr_enabled" type="toggle" />
                            </div>
                            <Field label="OCR Language" settingKey="ocr_language" placeholder="eng" help="Tesseract language code (eng, fra, deu, etc.)" />
                        </div>
                    )}
                </div>
            </div>

            {dirty && (
                <div className="fixed bottom-8 right-8 bg-[#10b981] text-black px-6 py-3 font-black text-[10px] uppercase tracking-widest flex items-center gap-3 shadow-2xl shadow-[#10b981]/30 animate-in slide-in-from-bottom duration-300">
                    <AlertTriangle className="w-4 h-4" /> Unsaved Changes
                    <button onClick={saveSettings} className="ml-4 bg-black/20 px-4 py-1.5 rounded-sm hover:bg-black/30 transition-colors">Save Now</button>
                </div>
            )}
        </div>
    );
}

