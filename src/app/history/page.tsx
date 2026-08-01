"use client";

import { useEffect, useState } from "react";
import {
    Play, Pause, FastForward, Rewind,
    SkipBack, SkipForward, Download, Clock,
    Calendar, Monitor, Search, RefreshCw, Loader2
} from "lucide-react";

interface Activity {
    id: number;
    hostname: string;
    window_title: string;
    screen_path: string;
    timestamp: string;
    keystrokes: string;
    status: string;
}

export default function HistoryPlayback() {
    const [activities, setActivities] = useState<Activity[]>([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [isPlaying, setIsPlaying] = useState(false);
    const [loading, setLoading] = useState(false);
    const [hostname, setHostname] = useState("");
    const [employees, setEmployees] = useState<any[]>([]);
    const [date, setDate] = useState(new Date().toISOString().split('T')[0]);

    useEffect(() => {
        fetch("/api/employees")
            .then(res => res.json())
            .then(data => setEmployees(data))
            .catch(e => console.error(e));
    }, []);

    const fetchHistory = async () => {
        if (!hostname) return;
        setLoading(true);
        try {
            const res = await fetch(`/api/history?hostname=${hostname}&date=${date}`);
            const data = await res.json();
            setActivities(data);
            setCurrentIndex(0);
        } catch (e) {
            console.error("Failed to fetch history:", e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        let interval: any;
        if (isPlaying && currentIndex < activities.length - 1) {
            interval = setInterval(() => {
                setCurrentIndex(prev => prev + 1);
            }, 5000); // 5 sec interval match between syncs
        } else {
            setIsPlaying(false);
            clearInterval(interval);
        }
        return () => clearInterval(interval);
    }, [isPlaying, currentIndex, activities.length]);

    const currentActivity = activities[currentIndex];

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-end">
                <div className="flex gap-8 items-end">
                    <div>
                        <h2 className="text-3xl font-bold text-white tracking-tight">Session History</h2>
                        <p className="text-gray-400 mt-1 uppercase text-[10px] font-black tracking-widest">Rewind and analyze past employee activity.</p>
                    </div>

                    <div className="flex gap-4 mb-1">
                        <div className="space-y-1">
                            <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest ml-1">Select Employee</label>
                            <select
                                value={hostname}
                                onChange={(e) => setHostname(e.target.value)}
                                className="bg-[#1a202c] border border-white/10 rounded-xl px-4 py-2 text-sm font-bold text-white outline-none focus:border-blue-500/30 w-56 appearance-none cursor-pointer"
                            >
                                <option value="">CHOOSE AGENT...</option>
                                {employees.map((emp: any) => (
                                    <option key={emp.hostname} value={emp.hostname}>{emp.username} ({emp.hostname})</option>
                                ))}
                            </select>
                        </div>
                        <div className="space-y-1">
                            <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest ml-1">Select Date</label>
                            <input
                                type="date"
                                value={date}
                                onChange={(e) => setDate(e.target.value)}
                                className="bg-[#1a202c] border border-white/10 rounded-xl px-4 py-2 text-sm font-bold text-white outline-none focus:border-blue-500/30"
                            />
                        </div>
                        <button
                            onClick={fetchHistory}
                            disabled={loading}
                            className="px-6 py-2 bg-blue-600 rounded-xl font-bold text-sm shadow-xl shadow-blue-600/20 self-end mb-[1px]"
                        >
                            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "LOAD HISTORY"}
                        </button>
                    </div>
                </div>

                {/* OCR Search Bar */}
                <div className="w-full max-w-md">
                    <div className="relative group">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 group-focus-within:text-blue-500 transition-colors" />
                        <input
                            type="text"
                            placeholder="SEARCH SCREEN TEXT (OCR)..."
                            className="w-full bg-[#0a0a0c] border border-white/10 rounded-xl pl-12 pr-4 py-3 text-sm font-bold text-white outline-none focus:border-blue-500/50 transition-all placeholder:text-gray-600 placeholder:font-bold placeholder:tracking-widest"
                            onKeyDown={async (e) => {
                                if (e.key === 'Enter') {
                                    const val = e.currentTarget.value;
                                    if (!val) return fetchHistory();

                                    setLoading(true);
                                    try {
                                        const res = await fetch(`/api/ocr-search?q=${encodeURIComponent(val)}`);
                                        const data = await res.json();
                                        setActivities(data);
                                        setCurrentIndex(0);
                                    } finally {
                                        setLoading(false);
                                    }
                                }
                            }}
                        />
                    </div>
                </div>
            </div>

            {activities.length > 0 ? (
                <div className="grid grid-cols-1 xl:grid-cols-4 gap-8">
                    <div className="xl:col-span-3 space-y-4">
                        <div className="aspect-video bg-[#0a0a0c] rounded-3xl border border-white/10 overflow-hidden relative shadow-2xl group">
                            <img
                                src={`/storage/${activities[currentIndex].screen_path}`}
                                className="w-full h-full object-contain"
                                alt="Playback"
                            />

                            <div className="absolute top-8 left-8 flex items-center gap-4 bg-black/60 backdrop-blur-xl px-4 py-2 rounded-2xl border border-white/10">
                                <div className={`w-2 h-2 rounded-full ${currentActivity.status === 'Active' ? 'bg-blue-600 shadow-[0_0_8px_rgba(37,99,235,0.5)]' : 'bg-gray-500'}`} />
                                <span className="text-xs font-mono font-bold tracking-widest text-white">
                                    {new Date(currentActivity.timestamp).toLocaleTimeString()}
                                </span>
                            </div>

                            <div className="absolute bottom-0 inset-x-0 p-8 bg-gradient-to-t from-black via-black/40 to-transparent">
                                <div className="space-y-6">
                                    <div
                                        className="relative h-1.5 w-full bg-white/10 rounded-full cursor-pointer group/timeline"
                                        onClick={(e) => {
                                            const rect = e.currentTarget.getBoundingClientRect();
                                            const percent = (e.clientX - rect.left) / rect.width;
                                            setCurrentIndex(Math.floor(percent * activities.length));
                                        }}
                                    >
                                        <div
                                            className="absolute h-full bg-blue-600 rounded-full"
                                            style={{ width: `${((currentIndex + 1) / activities.length) * 100}%` }}
                                        />
                                    </div>

                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-8 text-white">
                                            <SkipBack onClick={() => setCurrentIndex(0)} className="w-5 h-5 cursor-pointer hover:text-blue-500 transition-colors" />
                                            <button
                                                onClick={() => setIsPlaying(!isPlaying)}
                                                className="w-14 h-14 bg-white rounded-full flex items-center justify-center shadow-2xl hover:scale-110 transition-transform"
                                            >
                                                {isPlaying ? <Pause className="text-black fill-black w-6 h-6" /> : <Play className="text-black fill-black w-6 h-6 ml-1" />}
                                            </button>
                                            <SkipForward onClick={() => setCurrentIndex(activities.length - 1)} className="w-5 h-5 cursor-pointer hover:text-blue-500 transition-colors" />
                                        </div>

                                        <div className="flex items-center gap-6 text-right">
                                            <div className="flex flex-col items-end">
                                                <span className="text-[10px] font-black text-blue-500 tracking-tighter uppercase">Active Window</span>
                                                <span className="text-xs font-bold text-white max-w-[300px] truncate">{currentActivity.window_title}</span>
                                            </div>
                                            <div className="p-3 bg-white/5 rounded-xl border border-white/10">
                                                <span className="text-xs font-bold text-white">{currentIndex + 1} / {activities.length}</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="space-y-6">
                        <div className="p-6 bg-[#1a202c] border border-white/5 rounded-2xl h-full shadow-xl">
                            <h3 className="font-bold text-white tracking-tight mb-6 uppercase text-xs tracking-widest text-gray-500">Live Keystrokes at this moment</h3>
                            <div className="p-4 bg-black/40 rounded-xl border border-white/10 font-mono text-[11px] text-green-400 min-h-[150px] whitespace-pre-wrap">
                                {currentActivity.keystrokes || "[No keystrokes recorded]"}
                            </div>

                            <div className="mt-8 pt-6 border-t border-white/5 space-y-4">
                                <h3 className="font-bold text-white uppercase text-xs tracking-widest text-gray-500">Event Snapshot</h3>
                                <div className="space-y-4">
                                    <div className="flex justify-between items-center bg-white/5 p-3 rounded-lg">
                                        <span className="text-[10px] font-bold text-gray-400 uppercase">Status</span>
                                        <span className={`text-[10px] font-black px-2 py-0.5 rounded ${currentActivity.status === 'Active' ? 'bg-green-500/10 text-green-500' : 'bg-gray-500/20 text-gray-400'}`}>
                                            {currentActivity.status.toUpperCase()}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            ) : (
                <div className="glass-card flex flex-col items-center justify-center py-40 border-dashed border-2 border-white/5 rounded-3xl">
                    <Monitor className="w-16 h-16 text-white/5 mb-4" />
                    <p className="text-gray-500 font-bold">Please select an agent and date to load playback.</p>
                </div>
            )}
        </div>
    );
}
