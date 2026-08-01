"use client";

import { useEffect, useState, useCallback } from "react";
import {
    Clock, Users, Calendar, ChevronDown, RefreshCw, Loader2,
    Edit3, Check, X, UserCheck, UserX, AlertTriangle, TrendingUp
} from "lucide-react";

interface AttendanceRecord {
    hostname: string;
    username: string;
    day: string;
    clockIn: string;
    clockOut: string;
    hoursWorked: number;
    totalSnapshots: number;
    productiveSnaps: number;
    idleSnaps: number;
    override?: boolean;
    overrideNote?: string;
}

export default function AttendancePage() {
    const [records, setRecords] = useState<AttendanceRecord[]>([]);
    const [employees, setEmployees] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedEmployee, setSelectedEmployee] = useState("");
    const [editingRow, setEditingRow] = useState<string | null>(null);
    const [editForm, setEditForm] = useState({ clock_in: "", clock_out: "", hours_worked: "", status: "Present", note: "" });
    const [showOverrideModal, setShowOverrideModal] = useState(false);
    const [overrideTarget, setOverrideTarget] = useState<{ hostname: string; day: string } | null>(null);

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams();
            if (selectedEmployee) params.set("hostname", selectedEmployee);
            const [attRes, empRes] = await Promise.all([
                fetch(`/api/attendance?${params}`),
                fetch("/api/employees")
            ]);
            setRecords(await attRes.json());
            setEmployees(await empRes.json());
        } catch (e) { console.error(e); }
        finally { setLoading(false); }
    }, [selectedEmployee]);

    useEffect(() => { fetchData(); }, [fetchData]);

    const startEdit = (record: AttendanceRecord) => {
        const key = `${record.hostname}_${record.day}`;
        setEditingRow(key);
        setEditForm({
            clock_in: record.clockIn || "",
            clock_out: record.clockOut || "",
            hours_worked: record.hoursWorked?.toString() || "",
            status: "Present",
            note: record.overrideNote || ""
        });
    };

    const saveOverride = async (hostname: string, day: string) => {
        try {
            await fetch("/api/attendance/override", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    hostname, day,
                    clock_in: editForm.clock_in || null,
                    clock_out: editForm.clock_out || null,
                    hours_worked: editForm.hours_worked ? parseFloat(editForm.hours_worked) : null,
                    status: editForm.status,
                    note: editForm.note
                })
            });
            setEditingRow(null);
            fetchData();
        } catch (e) { console.error(e); }
    };

    const deleteOverride = async (hostname: string, day: string) => {
        await fetch(`/api/attendance/override?hostname=${hostname}&day=${day}`, { method: "DELETE" });
        fetchData();
    };

    const cancelEdit = () => setEditingRow(null);

    // Stats
    const todayRecords = records.filter(r => r.day === new Date().toISOString().split("T")[0]);
    const totalPresent = todayRecords.length;
    const lateArrivals = todayRecords.filter(r => r.clockIn > "09:30:00").length;
    const avgHours = todayRecords.length > 0 ? (todayRecords.reduce((sum, r) => sum + (r.hoursWorked || 0), 0) / todayRecords.length).toFixed(1) : "0";
    const totalEmployees = employees.length;

    return (
        <div className="space-y-8 animate-in fade-in duration-700 pb-20">
            {/* Header */}
            <div className="flex justify-between items-end border-b border-white/5 pb-10">
                <div className="space-y-4">
                    <div className="flex items-center gap-3">
                        <div className="w-1.5 h-1.5 bg-[#10b981]" />
                        <span className="text-[10px] font-black text-[#10b981] uppercase tracking-[0.4em]">Workforce Intelligence</span>
                    </div>
                    <h1 className="text-5xl font-black tracking-tighter text-white uppercase italic">Attend<span className="text-[#10b981]">ance</span></h1>
                    <p className="text-gray-600 font-bold text-xs uppercase tracking-[0.2em]">Auto-detected and manually managed attendance records with override support.</p>
                </div>
                <div className="flex gap-3 items-end">
                    <div className="space-y-1">
                        <label className="text-[9px] font-black text-gray-600 uppercase tracking-widest">Filter Employee</label>
                        <select value={selectedEmployee} onChange={e => setSelectedEmployee(e.target.value)}
                            className="bg-white/[0.02] border border-white/5 px-4 py-3 text-[10px] font-black text-white uppercase outline-none w-56">
                            <option value="">All Employees</option>
                            {employees.map((emp: any) => (
                                <option key={emp.hostname} value={emp.hostname}>{emp.username} ({emp.hostname})</option>
                            ))}
                        </select>
                    </div>
                    <button onClick={fetchData}
                        className="px-8 py-3 bg-white text-black font-black text-[10px] uppercase tracking-[0.2em] hover:bg-[#10b981] transition-all flex items-center gap-2">
                        <RefreshCw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} /> Sync
                    </button>
                </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-4 gap-1">
                <div className="p-5 border border-white/5 bg-white/[0.01]">
                    <p className="text-[8px] font-black text-gray-600 uppercase tracking-[0.3em]">Present Today</p>
                    <div className="flex items-end gap-2 mt-2">
                        <h3 className="text-2xl font-black tracking-tighter italic text-[#10b981]">{totalPresent}</h3>
                        <span className="text-[9px] font-bold text-gray-600 mb-1">/ {totalEmployees}</span>
                    </div>
                </div>
                <div className="p-5 border border-white/5 bg-white/[0.01]">
                    <p className="text-[8px] font-black text-gray-600 uppercase tracking-[0.3em]">Late Arrivals</p>
                    <h3 className="text-2xl font-black tracking-tighter italic text-orange-400 mt-2">{lateArrivals}</h3>
                </div>
                <div className="p-5 border border-white/5 bg-white/[0.01]">
                    <p className="text-[8px] font-black text-gray-600 uppercase tracking-[0.3em]">Avg Hours Today</p>
                    <h3 className="text-2xl font-black tracking-tighter italic text-white mt-2">{avgHours}h</h3>
                </div>
                <div className="p-5 border border-white/5 bg-white/[0.01]">
                    <p className="text-[8px] font-black text-gray-600 uppercase tracking-[0.3em]">Total Records</p>
                    <h3 className="text-2xl font-black tracking-tighter italic text-white mt-2">{records.length}</h3>
                </div>
            </div>

            {/* Attendance Table */}
            <div className="border border-white/5">
                <div className="grid grid-cols-[1fr_120px_100px_100px_100px_80px_80px_100px] gap-4 p-4 bg-white/[0.02] border-b border-white/5 text-[9px] font-black text-gray-600 uppercase tracking-widest">
                    <div>Employee</div>
                    <div>Date</div>
                    <div>Clock In</div>
                    <div>Clock Out</div>
                    <div>Hours</div>
                    <div>Snaps</div>
                    <div>Status</div>
                    <div>Actions</div>
                </div>

                {loading ? (
                    <div className="flex items-center justify-center py-20">
                        <Loader2 className="w-8 h-8 animate-spin text-[#10b981]" />
                    </div>
                ) : records.length === 0 ? (
                    <div className="py-20 text-center">
                        <Calendar className="w-12 h-12 text-gray-900 mx-auto mb-4" />
                        <p className="text-[10px] font-black text-gray-700 uppercase tracking-[0.4em]">No attendance records found</p>
                    </div>
                ) : (
                    records.map((record, idx) => {
                        const key = `${record.hostname}_${record.day}`;
                        const isEditing = editingRow === key;
                        const isLate = record.clockIn > "09:30:00";
                        const isOverride = record.override;

                        return (
                            <div key={idx} className={`grid grid-cols-[1fr_120px_100px_100px_100px_80px_80px_100px] gap-4 p-4 border-b border-white/5 hover:bg-white/[0.01] transition-colors ${isOverride ? "border-l-2 border-l-blue-500" : ""}`}>
                                <div className="flex items-center gap-3 min-w-0">
                                    <div className="w-8 h-8 bg-black border border-white/10 flex items-center justify-center shrink-0">
                                        <span className="text-xs font-black text-[#10b981]">{record.username?.[0]?.toUpperCase()}</span>
                                    </div>
                                    <div className="min-w-0">
                                        <p className="text-[11px] font-black text-white uppercase truncate">{record.username}</p>
                                        <p className="text-[9px] text-gray-600 font-mono">{record.hostname}</p>
                                    </div>
                                </div>
                                <div className="text-[10px] font-bold text-gray-400 self-center">{record.day}</div>

                                {isEditing ? (
                                    <>
                                        <input type="time" value={editForm.clock_in} onChange={e => setEditForm({ ...editForm, clock_in: e.target.value })}
                                            className="bg-white/[0.05] border border-[#10b981]/30 px-2 py-1 text-[10px] text-white outline-none self-center" />
                                        <input type="time" value={editForm.clock_out} onChange={e => setEditForm({ ...editForm, clock_out: e.target.value })}
                                            className="bg-white/[0.05] border border-[#10b981]/30 px-2 py-1 text-[10px] text-white outline-none self-center" />
                                        <input type="number" step="0.1" value={editForm.hours_worked} onChange={e => setEditForm({ ...editForm, hours_worked: e.target.value })}
                                            className="bg-white/[0.05] border border-[#10b981]/30 px-2 py-1 text-[10px] text-white outline-none w-20 self-center" />
                                    </>
                                ) : (
                                    <>
                                        <div className={`text-[10px] font-mono self-center ${isLate ? "text-orange-400" : "text-[#10b981]"}`}>
                                            {record.clockIn || "—"}
                                            {isLate && <AlertTriangle className="w-3 h-3 inline ml-1 text-orange-400" />}
                                        </div>
                                        <div className="text-[10px] font-mono text-gray-400 self-center">{record.clockOut || "—"}</div>
                                        <div className="text-[10px] font-black text-white self-center">{record.hoursWorked?.toFixed(1) || "—"}h</div>
                                    </>
                                )}

                                <div className="text-[10px] font-bold text-gray-500 self-center">{record.totalSnapshots}</div>
                                <div className="self-center">
                                    {isOverride ? (
                                        <span className="text-[8px] font-black uppercase px-2 py-1 bg-blue-500/10 text-blue-400 border border-blue-500/30">Override</span>
                                    ) : isLate ? (
                                        <span className="text-[8px] font-black uppercase px-2 py-1 bg-orange-500/10 text-orange-400 border border-orange-500/30">Late</span>
                                    ) : (
                                        <span className="text-[8px] font-black uppercase px-2 py-1 bg-[#10b981]/10 text-[#10b981] border border-[#10b981]/30">On Time</span>
                                    )}
                                </div>
                                <div className="flex gap-1 self-center">
                                    {isEditing ? (
                                        <>
                                            <button onClick={() => saveOverride(record.hostname, record.day)} className="p-1.5 bg-[#10b981]/10 text-[#10b981] hover:bg-[#10b981]/20 transition-colors"><Check className="w-3 h-3" /></button>
                                            <button onClick={cancelEdit} className="p-1.5 bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors"><X className="w-3 h-3" /></button>
                                        </>
                                    ) : (
                                        <>
                                            <button onClick={() => startEdit(record)} title="Override" className="p-1.5 hover:bg-white/5 text-gray-600 hover:text-white transition-colors"><Edit3 className="w-3 h-3" /></button>
                                            {isOverride && (
                                                <button onClick={() => deleteOverride(record.hostname, record.day)} title="Remove Override" className="p-1.5 hover:bg-red-500/10 text-gray-600 hover:text-red-400 transition-colors"><X className="w-3 h-3" /></button>
                                            )}
                                        </>
                                    )}
                                </div>
                            </div>
                        );
                    })
                )}
            </div>
        </div>
    );
}
