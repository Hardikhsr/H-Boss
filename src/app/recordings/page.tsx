"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import {
    Play, Pause, SkipBack, SkipForward, ChevronLeft,
    Monitor, Calendar, Clock, Film,
    Loader2, Grid, FastForward, Rewind, Eye, Maximize2, Minimize2, Download
} from "lucide-react";

interface RecordingDate {
    date: string;
    hostname: string;
    username: string;
    frameCount: number;
    firstFrame: string;
    lastFrame: string;
}

interface HourBlock {
    hour: string;
    label: string;
    count: number;
    firstTimestamp: string;
    lastTimestamp: string;
    hasActivity: boolean;
}

interface Frame {
    id: number;
    hostname: string;
    username: string;
    window_title: string;
    screen_path: string;
    category: string;
    status: string;
    timestamp: string;
    keystrokes?: string;
    ocr_text?: string;
}

interface Employee {
    hostname: string;
    username: string;
    totalFrames: number;
    recordedDays: number;
    firstRecorded: string;
    lastRecorded: string;
}

const CATEGORY_COLORS: Record<string, string> = {
    Productive: "#10b981",
    Unproductive: "#ef4444",
    Browsing: "#3b82f6",
    Neutral: "#6b7280",
    System: "#8b5cf6",
};

const PLAYBACK_SPEEDS = [0.5, 1, 2, 4, 8];

export default function RecordingsPage() {
    const [view, setView] = useState<"browse" | "playback">("browse");
    const [loading, setLoading] = useState(true);

    // Browse
    const [employees, setEmployees] = useState<Employee[]>([]);
    const [dates, setDates] = useState<RecordingDate[]>([]);
    const [selectedEmployee, setSelectedEmployee] = useState("");
    const [selectedDate, setSelectedDate] = useState("");

    // Hourly blocks
    const [hourBlocks, setHourBlocks] = useState<HourBlock[]>([]);

    // Playback
    const [frames, setFrames] = useState<Frame[]>([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [isPlaying, setIsPlaying] = useState(false);
    const [speed, setSpeed] = useState(1);
    const [summary, setSummary] = useState<any>({});
    const [playbackLabel, setPlaybackLabel] = useState("");
    const animRef = useRef<number | null>(null);
    const lastFrameTimeRef = useRef(0);
    const imgRef = useRef<HTMLImageElement>(null);
    const viewerRef = useRef<HTMLDivElement>(null);
    const [preloadedSrc, setPreloadedSrc] = useState("");
    const [isFullscreen, setIsFullscreen] = useState(false);

    const toggleFullscreen = () => {
        if (!viewerRef.current) return;
        if (!document.fullscreenElement) {
            viewerRef.current.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
        } else {
            document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
        }
    };

    const downloadFrames = () => {
        if (!selectedEmployee || !selectedDate) return;
        window.open(`/api/recordings/download?hostname=${encodeURIComponent(selectedEmployee)}&date=${selectedDate}`, "_blank");
    };

    useEffect(() => {
        const handler = () => setIsFullscreen(!!document.fullscreenElement);
        document.addEventListener("fullscreenchange", handler);
        return () => document.removeEventListener("fullscreenchange", handler);
    }, []);

    const safe = async (url: string, fallback: any = []) => {
        try { const r = await fetch(url); if (!r.ok) return fallback; return await r.json(); } catch { return fallback; }
    };

    // Load employees
    useEffect(() => {
        safe("/api/recordings/employees").then(data => {
            setEmployees(data);
            setLoading(false);
        });
    }, []);

    // Load dates when employee selected
    useEffect(() => {
        if (!selectedEmployee) return;
        safe(`/api/recordings/dates?hostname=${encodeURIComponent(selectedEmployee)}`).then(setDates);
    }, [selectedEmployee]);

    // Build hourly blocks when date is selected
    useEffect(() => {
        if (!selectedEmployee || !selectedDate) { setHourBlocks([]); return; }

        safe(`/api/recordings/playback?hostname=${encodeURIComponent(selectedEmployee)}&date=${selectedDate}`).then(data => {
            const framesData: Frame[] = data.frames || [];
            // Group frames by hour
            const hourMap = new Map<number, Frame[]>();
            framesData.forEach(f => {
                const d = new Date(f.timestamp);
                const h = d.getHours();
                if (!hourMap.has(h)) hourMap.set(h, []);
                hourMap.get(h)!.push(f);
            });

            const blocks: HourBlock[] = [];
            for (let h = 0; h < 24; h++) {
                const hFrames = hourMap.get(h);
                const hStr = h.toString().padStart(2, "0");
                blocks.push({
                    hour: hStr,
                    label: `${hStr}:00 — ${hStr}:59`,
                    count: hFrames?.length || 0,
                    firstTimestamp: hFrames?.[0]?.timestamp || "",
                    lastTimestamp: hFrames?.[hFrames.length - 1]?.timestamp || "",
                    hasActivity: (hFrames?.length || 0) > 0,
                });
            }
            setHourBlocks(blocks);
        });
    }, [selectedEmployee, selectedDate]);

    // Start playback for a specific hour or full day
    const startPlayback = useCallback(async (hostname: string, date: string, startHour?: string, endHour?: string, label?: string) => {
        setLoading(true);
        let url = `/api/recordings/playback?hostname=${encodeURIComponent(hostname)}&date=${date}`;
        if (startHour !== undefined) url += `&startTime=${startHour}:00:00`;
        if (endHour !== undefined) url += `&endTime=${endHour}:59:59`;

        const data = await safe(url);
        setFrames(data.frames || []);
        setSummary(data.summary || {});
        setCurrentIndex(0);
        setIsPlaying(false);
        setPlaybackLabel(label || `${hostname} — ${date}`);
        setView("playback");
        setLoading(false);
    }, []);

    // 60fps playback loop using requestAnimationFrame
    useEffect(() => {
        if (!isPlaying || frames.length === 0) {
            if (animRef.current) cancelAnimationFrame(animRef.current);
            return;
        }

        // Base interval: time between frames in ms
        // At 1x speed with ~5s capture interval, show each frame for ~80ms (60fps feel)
        // Faster speeds = shorter hold time
        const baseIntervalMs = Math.max(16, 1000 / speed); // Minimum 16ms = 60fps

        const tick = (timestamp: number) => {
            if (!lastFrameTimeRef.current) lastFrameTimeRef.current = timestamp;
            const elapsed = timestamp - lastFrameTimeRef.current;

            if (elapsed >= baseIntervalMs) {
                lastFrameTimeRef.current = timestamp;
                setCurrentIndex(prev => {
                    if (prev >= frames.length - 1) {
                        setIsPlaying(false);
                        return prev;
                    }
                    return prev + 1;
                });
            }
            animRef.current = requestAnimationFrame(tick);
        };

        lastFrameTimeRef.current = 0;
        animRef.current = requestAnimationFrame(tick);

        return () => {
            if (animRef.current) cancelAnimationFrame(animRef.current);
        };
    }, [isPlaying, speed, frames.length]);

    // Preload next image for smooth transitions
    useEffect(() => {
        if (frames.length === 0) return;
        const nextIdx = Math.min(currentIndex + 1, frames.length - 1);
        const nextSrc = `/storage/${frames[nextIdx]?.screen_path}`;
        const img = new Image();
        img.src = nextSrc;
    }, [currentIndex, frames]);

    // Keyboard shortcuts
    useEffect(() => {
        if (view !== "playback") return;
        const handler = (e: KeyboardEvent) => {
            if (e.code === "Space") { e.preventDefault(); setIsPlaying(p => !p); }
            if (e.code === "ArrowRight") setCurrentIndex(p => Math.min(p + 1, frames.length - 1));
            if (e.code === "ArrowLeft") setCurrentIndex(p => Math.max(p - 1, 0));
            if (e.code === "Home") setCurrentIndex(0);
            if (e.code === "End") setCurrentIndex(frames.length - 1);
            if (e.code === "BracketRight") setSpeed(s => { const i = PLAYBACK_SPEEDS.indexOf(s); return PLAYBACK_SPEEDS[Math.min(i + 1, PLAYBACK_SPEEDS.length - 1)]; });
            if (e.code === "BracketLeft") setSpeed(s => { const i = PLAYBACK_SPEEDS.indexOf(s); return PLAYBACK_SPEEDS[Math.max(i - 1, 0)]; });
        };
        window.addEventListener("keydown", handler);
        return () => window.removeEventListener("keydown", handler);
    }, [view, frames.length]);

    const currentFrame = frames[currentIndex];

    // Format timestamp for display
    const formatCaptureTime = (ts: string) => {
        if (!ts) return { date: "", time: "" };
        const d = new Date(ts);
        const date = d.toLocaleDateString("en-US", { weekday: "short", year: "numeric", month: "short", day: "numeric" });
        const time = d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true });
        return { date, time };
    };

    // ─── BROWSE VIEW ───
    if (view === "browse") {
        return (
            <div className="space-y-6 animate-in fade-in duration-500 pb-20">
                {/* Header */}
                <div className="flex justify-between items-end border-b border-white/5 pb-8">
                    <div className="space-y-3">
                        <div className="flex items-center gap-3">
                            <div className="w-1.5 h-1.5 bg-[#10b981]" />
                            <span className="text-[10px] font-black text-[#10b981] uppercase tracking-[0.4em]">Session Archive</span>
                        </div>
                        <h1 className="text-5xl font-black tracking-tighter text-white uppercase italic">
                            Record<span className="text-[#10b981]">ings</span>
                        </h1>
                        <p className="text-[11px] text-gray-600 font-bold">Select an employee, pick a date, then choose an hour block to replay.</p>
                    </div>
                </div>

                {loading ? (
                    <div className="flex flex-col items-center py-32">
                        <Loader2 className="w-12 h-12 animate-spin text-[#10b981]" />
                    </div>
                ) : (
                    <div className="grid grid-cols-1 xl:grid-cols-12 gap-1">
                        {/* Employee List */}
                        <div className="xl:col-span-3 border border-white/5 bg-white/[0.01]">
                            <div className="p-5 bg-black/40 border-b border-white/5 flex items-center gap-3">
                                <Monitor className="w-4 h-4 text-[#10b981]/50" />
                                <span className="text-[10px] font-black text-white uppercase tracking-widest">Employee</span>
                            </div>
                            <div className="divide-y divide-white/5 max-h-[600px] overflow-y-auto custom-scrollbar">
                                {employees.map(emp => (
                                    <button
                                        key={emp.hostname}
                                        onClick={() => { setSelectedEmployee(emp.hostname); setSelectedDate(""); setHourBlocks([]); }}
                                        className={`w-full text-left p-4 hover:bg-white/[0.03] transition-all group ${selectedEmployee === emp.hostname ? "bg-[#10b981]/5 border-l-2 border-[#10b981]" : "border-l-2 border-transparent"}`}
                                    >
                                        <p className={`text-[11px] font-black uppercase ${selectedEmployee === emp.hostname ? "text-[#10b981]" : "text-white group-hover:text-[#10b981]"} transition-colors`}>{emp.hostname}</p>
                                        <p className="text-[9px] text-gray-600 mt-0.5">{emp.username} • {emp.totalFrames.toLocaleString()} frames • {emp.recordedDays} days</p>
                                    </button>
                                ))}
                                {employees.length === 0 && (
                                    <div className="py-16 text-center text-gray-700 text-[10px] font-black uppercase tracking-widest">No recordings found</div>
                                )}
                            </div>
                        </div>

                        {/* Date Picker */}
                        <div className="xl:col-span-3 border border-white/5 bg-white/[0.01]">
                            <div className="p-5 bg-black/40 border-b border-white/5 flex items-center gap-3">
                                <Calendar className="w-4 h-4 text-[#10b981]/50" />
                                <span className="text-[10px] font-black text-white uppercase tracking-widest">Date</span>
                            </div>
                            {selectedEmployee ? (
                                <div className="divide-y divide-white/5 max-h-[600px] overflow-y-auto custom-scrollbar">
                                    {dates.map(d => (
                                        <button
                                            key={d.date}
                                            onClick={() => setSelectedDate(d.date)}
                                            className={`w-full text-left p-4 hover:bg-white/[0.03] transition-all group ${selectedDate === d.date ? "bg-[#10b981]/5 border-l-2 border-[#10b981]" : "border-l-2 border-transparent"}`}
                                        >
                                            <div className="flex justify-between items-center">
                                                <div>
                                                    <p className={`text-[12px] font-black ${selectedDate === d.date ? "text-[#10b981]" : "text-white group-hover:text-[#10b981]"} transition-colors`}>
                                                        {new Date(d.date + "T00:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                                                    </p>
                                                    <p className="text-[8px] text-gray-700 font-mono mt-0.5">{d.date}</p>
                                                </div>
                                                <div className="text-right">
                                                    <p className="text-[10px] font-black text-gray-500">{d.frameCount}</p>
                                                    <p className="text-[8px] text-gray-700">frames</p>
                                                </div>
                                            </div>
                                        </button>
                                    ))}
                                    {dates.length === 0 && (
                                        <div className="py-16 text-center text-gray-700 text-[10px] font-black uppercase tracking-widest">No recordings</div>
                                    )}
                                </div>
                            ) : (
                                <div className="flex flex-col items-center justify-center py-20">
                                    <Calendar className="w-10 h-10 text-white/5 mb-3" />
                                    <p className="text-gray-700 text-[10px] font-bold uppercase tracking-widest">Select employee first</p>
                                </div>
                            )}
                        </div>

                        {/* Hourly Timeline */}
                        <div className="xl:col-span-6 border border-white/5 bg-white/[0.01]">
                            <div className="p-5 bg-black/40 border-b border-white/5 flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <Clock className="w-4 h-4 text-[#10b981]/50" />
                                    <span className="text-[10px] font-black text-white uppercase tracking-widest">Hourly Timeline</span>
                                </div>
                                {selectedDate && (
                                    <button
                                        onClick={() => startPlayback(selectedEmployee, selectedDate, undefined, undefined, `${selectedEmployee} — ${selectedDate} (Full Day)`)}
                                        className="px-4 py-2 bg-[#10b981] text-black font-black text-[9px] uppercase tracking-[0.2em] hover:bg-[#10b981]/80 transition-all flex items-center gap-2"
                                    >
                                        <Play className="w-3 h-3" /> Play Full Day
                                    </button>
                                )}
                            </div>
                            {selectedDate ? (
                                <div className="p-3 max-h-[600px] overflow-y-auto custom-scrollbar">
                                    <div className="grid grid-cols-1 gap-0.5">
                                        {hourBlocks.map(block => (
                                            <button
                                                key={block.hour}
                                                disabled={!block.hasActivity}
                                                onClick={() => {
                                                    if (block.hasActivity) {
                                                        startPlayback(
                                                            selectedEmployee, selectedDate,
                                                            block.hour, block.hour,
                                                            `${selectedEmployee} — ${selectedDate} / ${block.label}`
                                                        );
                                                    }
                                                }}
                                                className={`flex items-center gap-4 px-4 py-3 transition-all text-left ${
                                                    block.hasActivity
                                                        ? "hover:bg-[#10b981]/5 cursor-pointer group"
                                                        : "opacity-20 cursor-default"
                                                }`}
                                            >
                                                {/* Hour label */}
                                                <span className="text-[13px] font-black text-gray-500 w-14 shrink-0 font-mono">{block.hour}:00</span>

                                                {/* Activity bar */}
                                                <div className="flex-1 relative h-6 bg-white/[0.02] border border-white/5 overflow-hidden">
                                                    {block.hasActivity && (
                                                        <div
                                                            className="absolute inset-y-0 left-0 bg-[#10b981]/20 group-hover:bg-[#10b981]/30 transition-colors"
                                                            style={{ width: `${Math.min(100, (block.count / Math.max(...hourBlocks.filter(b => b.hasActivity).map(b => b.count), 1)) * 100)}%` }}
                                                        />
                                                    )}
                                                    {block.hasActivity && (
                                                        <div className="absolute inset-0 flex items-center px-3 justify-between">
                                                            <span className="text-[9px] font-black text-gray-400 group-hover:text-[#10b981] transition-colors">{block.count} frames</span>
                                                            <Play className="w-3 h-3 text-gray-700 group-hover:text-[#10b981] opacity-0 group-hover:opacity-100 transition-all" />
                                                        </div>
                                                    )}
                                                </div>

                                                {/* Time range */}
                                                {block.hasActivity && (
                                                    <span className="text-[8px] font-mono text-gray-700 w-28 shrink-0 text-right">
                                                        {block.firstTimestamp?.split("T")[1]?.split(".")[0] || ""} — {block.lastTimestamp?.split("T")[1]?.split(".")[0] || ""}
                                                    </span>
                                                )}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            ) : (
                                <div className="flex flex-col items-center justify-center py-32">
                                    <Film className="w-16 h-16 text-white/5 mb-4" />
                                    <p className="text-gray-700 text-[10px] font-bold uppercase tracking-widest">
                                        {selectedEmployee ? "Select a date to see hourly breakdown" : "Select employee and date"}
                                    </p>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        );
    }

    // ─── PLAYBACK VIEW ───
    const captureTime = currentFrame ? formatCaptureTime(currentFrame.timestamp) : null;

    return (
        <div className="space-y-3 animate-in fade-in duration-500 pb-20">
            {/* Top Bar with Back + Label + Actions */}
            <div className="flex items-center gap-4">
                <button onClick={() => { setIsPlaying(false); setView("browse"); }} className="p-2 hover:bg-white/5 transition-colors">
                    <ChevronLeft className="w-5 h-5 text-gray-600 hover:text-white" />
                </button>
                <div className="flex-1 min-w-0">
                    <h2 className="text-lg font-black text-white uppercase tracking-tight italic truncate">{playbackLabel}</h2>
                    <p className="text-[9px] text-gray-600 font-bold uppercase tracking-widest">
                        {frames.length} frames • {summary.uniqueApps || 0} apps • Space to play/pause • [ ] to change speed
                    </p>
                </div>
                <div className="flex gap-2 shrink-0">
                    <button onClick={downloadFrames}
                        className="px-4 py-2 bg-white/5 border border-white/10 text-gray-400 hover:text-white hover:border-white/30 text-[9px] font-black uppercase tracking-widest flex items-center gap-2 transition-all">
                        <Download className="w-3 h-3" /> Export Frames
                    </button>
                    <button onClick={toggleFullscreen}
                        className="px-4 py-2 bg-[#10b981] text-black text-[9px] font-black uppercase tracking-widest flex items-center gap-2 hover:bg-[#10b981]/80 transition-all">
                        {isFullscreen ? <Minimize2 className="w-3 h-3" /> : <Maximize2 className="w-3 h-3" />}
                        {isFullscreen ? "Exit" : "Fullscreen"}
                    </button>
                </div>
            </div>

            {loading ? (
                <div className="flex items-center justify-center py-32">
                    <Loader2 className="w-12 h-12 animate-spin text-[#10b981]" />
                </div>
            ) : frames.length > 0 && currentFrame ? (
                <div className="grid grid-cols-1 xl:grid-cols-12 gap-3">
                    {/* Main Viewer */}
                    <div className="xl:col-span-9 space-y-2">
                        <div ref={viewerRef} className="relative aspect-video bg-black border border-white/5 overflow-hidden group">
                            {/* The actual frame */}
                            <img
                                ref={imgRef}
                                src={`/storage/${currentFrame.screen_path}`}
                                className="w-full h-full object-contain"
                                alt={`Frame ${currentIndex + 1}`}
                                draggable={false}
                            />

                            {/* ═══ TOP: REAL-TIME CAPTURE TIMESTAMP ═══ */}
                            <div className="absolute top-0 inset-x-0 bg-gradient-to-b from-black/80 to-transparent p-4 flex items-start justify-between">
                                {/* Date + Time — Always visible */}
                                <div className="flex items-center gap-4">
                                    <div className="bg-black/70 backdrop-blur-sm border border-[#10b981]/30 px-4 py-2">
                                        <div className="flex items-center gap-3">
                                            <div className={`w-2 h-2 ${isPlaying ? "bg-red-500 animate-pulse" : "bg-[#10b981]"}`} />
                                            <div>
                                                <p className="text-[18px] font-black text-white font-mono tracking-tight leading-none">
                                                    {captureTime?.time}
                                                </p>
                                                <p className="text-[10px] font-bold text-[#10b981]/80 mt-0.5">
                                                    {captureTime?.date}
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                    {/* Status badge */}
                                    <div className={`px-3 py-1 border ${currentFrame.status === "Active" ? "border-[#10b981]/30 bg-[#10b981]/10" : "border-gray-700 bg-gray-900/50"}`}>
                                        <span className={`text-[9px] font-black uppercase tracking-widest ${currentFrame.status === "Active" ? "text-[#10b981]" : "text-gray-500"}`}>
                                            {currentFrame.status}
                                        </span>
                                    </div>
                                </div>

                                {/* Frame counter */}
                                <div className="bg-black/70 backdrop-blur-sm border border-white/10 px-3 py-2">
                                    <span className="text-[11px] font-black text-white font-mono">{currentIndex + 1} / {frames.length}</span>
                                </div>
                            </div>

                            {/* ═══ BOTTOM: CONTROLS (shown on hover) ═══ */}
                            <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black via-black/70 to-transparent p-5 pt-16 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                                {/* Timeline Scrubber */}
                                <div
                                    className="relative h-2 w-full bg-white/10 mb-5 cursor-pointer group/timeline"
                                    onClick={(e) => {
                                        const rect = e.currentTarget.getBoundingClientRect();
                                        const pct = (e.clientX - rect.left) / rect.width;
                                        setCurrentIndex(Math.max(0, Math.min(frames.length - 1, Math.floor(pct * frames.length))));
                                    }}
                                >
                                    <div className="absolute h-full bg-[#10b981]" style={{ width: `${((currentIndex + 1) / frames.length) * 100}%` }} />
                                    <div
                                        className="absolute w-4 h-4 bg-[#10b981] rounded-full -top-[4px] shadow-[0_0_8px_rgba(16,185,129,0.5)] border-2 border-black"
                                        style={{ left: `${((currentIndex + 1) / frames.length) * 100}%`, transform: "translateX(-50%)" }}
                                    />
                                    {/* Tooltip on hover */}
                                    <div
                                        className="absolute -top-8 bg-black/90 border border-white/10 px-2 py-1 opacity-0 group-hover/timeline:opacity-100 transition-opacity pointer-events-none"
                                        style={{ left: `${((currentIndex + 1) / frames.length) * 100}%`, transform: "translateX(-50%)" }}
                                    >
                                        <span className="text-[9px] font-mono text-white">{captureTime?.time}</span>
                                    </div>
                                </div>

                                {/* Controls Row */}
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-5">
                                        <button onClick={() => setCurrentIndex(0)} className="text-white hover:text-[#10b981] transition-colors" title="First frame">
                                            <SkipBack className="w-4 h-4" />
                                        </button>
                                        <button onClick={() => setCurrentIndex(p => Math.max(0, p - 30))} className="text-white hover:text-[#10b981] transition-colors" title="Back 30 frames">
                                            <Rewind className="w-4 h-4" />
                                        </button>
                                        <button
                                            onClick={() => setIsPlaying(!isPlaying)}
                                            className="w-12 h-12 bg-white rounded-full flex items-center justify-center hover:scale-110 transition-transform shadow-xl"
                                        >
                                            {isPlaying ? <Pause className="text-black w-5 h-5" /> : <Play className="text-black w-5 h-5 ml-0.5" />}
                                        </button>
                                        <button onClick={() => setCurrentIndex(p => Math.min(frames.length - 1, p + 30))} className="text-white hover:text-[#10b981] transition-colors" title="Forward 30 frames">
                                            <FastForward className="w-4 h-4" />
                                        </button>
                                        <button onClick={() => setCurrentIndex(frames.length - 1)} className="text-white hover:text-[#10b981] transition-colors" title="Last frame">
                                            <SkipForward className="w-4 h-4" />
                                        </button>
                                    </div>

                                    {/* Speed Control */}
                                    <div className="flex items-center gap-1 bg-black/50 border border-white/10 p-1">
                                        {PLAYBACK_SPEEDS.map(s => (
                                            <button
                                                key={s}
                                                onClick={() => setSpeed(s)}
                                                className={`px-3 py-1.5 text-[10px] font-black uppercase transition-all ${speed === s ? "bg-[#10b981] text-black" : "text-gray-400 hover:text-white hover:bg-white/5"}`}
                                            >
                                                {s}x
                                            </button>
                                        ))}
                                    </div>

                                    {/* Current Window */}
                                    <div className="max-w-[250px] text-right">
                                        <p className="text-[8px] font-black text-[#10b981] uppercase tracking-wider">Window</p>
                                        <p className="text-[10px] font-bold text-white truncate">{currentFrame.window_title}</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Side Panel */}
                    <div className="xl:col-span-3 space-y-3">
                        {/* Capture Info */}
                        <div className="border border-white/5 bg-white/[0.01] p-4">
                            <h3 className="text-[9px] font-black text-gray-600 uppercase tracking-[0.3em] mb-3">Captured At</h3>
                            <div className="bg-black/40 border border-[#10b981]/20 p-3 mb-3">
                                <p className="text-[20px] font-black text-white font-mono tracking-tight">{captureTime?.time}</p>
                                <p className="text-[11px] font-bold text-[#10b981]/70 mt-1">{captureTime?.date}</p>
                            </div>
                            <div className="space-y-2">
                                <InfoRow label="Window" value={currentFrame.window_title} />
                                <InfoRow label="Category" value={currentFrame.category || "Unknown"} valueColor={CATEGORY_COLORS[currentFrame.category]} />
                                <InfoRow label="Status" value={currentFrame.status || "Unknown"} />
                            </div>
                        </div>

                        {/* Keystrokes */}
                        {currentFrame.keystrokes && (
                            <div className="border border-white/5 bg-white/[0.01] p-4">
                                <h3 className="text-[9px] font-black text-gray-600 uppercase tracking-[0.3em] mb-3">Keystrokes</h3>
                                <div className="p-3 bg-black/40 border border-white/10 font-mono text-[10px] text-[#10b981] max-h-[150px] overflow-y-auto whitespace-pre-wrap custom-scrollbar">
                                    {currentFrame.keystrokes}
                                </div>
                            </div>
                        )}

                        {/* Session Summary */}
                        <div className="border border-white/5 bg-white/[0.01] p-4">
                            <h3 className="text-[9px] font-black text-gray-600 uppercase tracking-[0.3em] mb-3">Session Stats</h3>
                            <div className="space-y-2">
                                <InfoRow label="Total Frames" value={summary.totalFrames || 0} />
                                <InfoRow label="Duration" value={`${summary.firstFrame?.split("T")[1]?.split(".")[0] || "?"} — ${summary.lastFrame?.split("T")[1]?.split(".")[0] || "?"}`} />
                                <InfoRow label="Apps Used" value={summary.uniqueApps || 0} />
                                <InfoRow label="Productive" value={summary.productive || 0} valueColor="#10b981" />
                                <InfoRow label="Unproductive" value={summary.unproductive || 0} valueColor="#ef4444" />
                                <InfoRow label="Active" value={summary.activeFrames || 0} />
                                <InfoRow label="Idle" value={summary.idleFrames || 0} />
                            </div>
                        </div>

                        {/* Keyboard Shortcuts */}
                        <div className="border border-white/5 bg-white/[0.01] p-4">
                            <h3 className="text-[9px] font-black text-gray-600 uppercase tracking-[0.3em] mb-3">Shortcuts</h3>
                            <div className="grid grid-cols-2 gap-1 text-[8px]">
                                <Key k="Space" action="Play / Pause" />
                                <Key k="← →" action="Prev / Next" />
                                <Key k="[ ]" action="Speed ∓" />
                                <Key k="Home / End" action="First / Last" />
                            </div>
                        </div>
                    </div>
                </div>
            ) : (
                <div className="flex flex-col items-center justify-center py-32">
                    <Film className="w-16 h-16 text-white/5 mb-4" />
                    <p className="text-gray-600 text-[11px] font-bold uppercase tracking-widest">No frames found for this time block</p>
                </div>
            )}
        </div>
    );
}

function InfoRow({ label, value, valueColor }: { label: string; value: any; valueColor?: string }) {
    return (
        <div className="flex justify-between items-start">
            <span className="text-[9px] font-black text-gray-700 uppercase">{label}</span>
            <span className="text-[10px] font-bold text-right max-w-[180px] truncate" style={{ color: valueColor || "#fff" }}>
                {value}
            </span>
        </div>
    );
}

function Key({ k, action }: { k: string; action: string }) {
    return (
        <div className="flex items-center gap-1.5 p-1.5 bg-white/[0.02]">
            <span className="font-mono font-black text-gray-500">{k}</span>
            <span className="text-gray-700">{action}</span>
        </div>
    );
}
