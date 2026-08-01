"use client";

import { useState, useEffect } from "react";
import { Search, Eye, FileText, Calendar, Filter, Loader2, Terminal, ZoomIn, Activity } from "lucide-react";

interface OCRResult {
    id: number;
    hostname: string;
    username: string;
    window_title: string;
    screen_path: string;
    timestamp: string;
    ocr_text: string;
}

export default function OCRSearch() {
    const [query, setQuery] = useState("");
    const [results, setResults] = useState<OCRResult[]>([]);
    const [loading, setLoading] = useState(false);

    const handleSearch = async () => {
        if (!query.trim()) return;
        setLoading(true);
        try {
            const res = await fetch(`/api/ocr-search?q=${encodeURIComponent(query)}`);
            const data = await res.json();
            setResults(data);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="space-y-12 animate-in fade-in duration-1000">
            {/* Tactical Header */}
            <div className="flex justify-between items-end border-b border-white/5 pb-12">
                <div className="space-y-4">
                    <div className="flex items-center gap-3">
                        <div className="w-1.5 h-1.5 bg-[#10b981]" />
                        <span className="text-[10px] font-black text-[#10b981] uppercase tracking-[0.4em]">Visual Intelligence</span>
                    </div>
                    <h1 className="text-5xl font-black tracking-tighter text-white uppercase italic">Deep<span className="text-[#10b981]">Scan</span></h1>
                    <p className="text-gray-600 font-bold text-xs uppercase tracking-[0.2em] max-w-xl">
                        Universal OCR indexing across all endpoints. Search for credentials, names, or sensitive strings captured in frame.
                    </p>
                </div>
            </div>

            {/* Tactical Search Input */}
            <div className="p-1 bg-white/[0.02] border border-white/5">
                <div className="p-8 bg-black/40 flex gap-1">
                    <div className="relative flex-1 group">
                        <Search className="absolute left-6 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-700 group-focus-within:text-[#10b981] transition-colors" />
                        <input
                            type="text"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                            placeholder="SEARCH ENCRYPTED VISUAL LEDGER..."
                            className="w-full bg-transparent border-none outline-none pl-16 pr-8 py-5 text-[11px] font-black text-white uppercase tracking-[0.2em] placeholder:text-gray-800"
                        />
                    </div>
                    <button
                        onClick={handleSearch}
                        disabled={loading}
                        className="px-12 py-5 bg-[#10b981] text-black font-black text-[11px] uppercase tracking-[0.3em] hover:bg-[#10b981]/80 disabled:opacity-50 transition-all flex items-center gap-4"
                    >
                        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Terminal className="w-4 h-4" />}
                        {loading ? 'Analyzing' : 'Execute'}
                    </button>
                </div>
            </div>

            {/* Results Deck */}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-1">
                {results.length === 0 && !loading && query && (
                    <div className="col-span-full py-32 text-center border border-white/5 bg-white/[0.01]">
                        <Terminal className="w-12 h-12 text-gray-900 mx-auto mb-6" />
                        <p className="text-[10px] font-black text-gray-700 uppercase tracking-[0.5em] italic">No technical matches found in visual matrix</p>
                    </div>
                )}

                {results.map((res) => {
                    const lowerText = res.ocr_text.toLowerCase();
                    const lowerQuery = query.toLowerCase();
                    const index = lowerText.indexOf(lowerQuery);
                    const excerpt = index !== -1
                        ? res.ocr_text.substring(Math.max(0, index - 40), Math.min(res.ocr_text.length, index + 60))
                        : res.ocr_text.substring(0, 100);

                    return (
                        <div key={res.id} className="p-8 bg-white/[0.02] border border-white/5 hover:border-[#10b981]/50 transition-all group relative overflow-hidden flex flex-col h-full">
                            <div className="aspect-video bg-black/60 border border-white/5 relative overflow-hidden mb-8">
                                <img
                                    src={`/storage/${res.screen_path}`}
                                    alt="Screen Capture"
                                    className="w-full h-full object-contain grayscale opacity-30 group-hover:grayscale-0 group-hover:opacity-100 transition-all duration-700"
                                />
                                <div className="absolute inset-0 bg-gradient-to-t from-black to-transparent opacity-60" />

                                <div className="absolute top-4 left-4 flex gap-2">
                                    <div className="px-2 py-0.5 bg-black/80 border border-white/10 text-[8px] font-black text-gray-500 uppercase">
                                        Frame #{res.id}
                                    </div>
                                </div>

                                <a
                                    href={`/storage/${res.screen_path}`}
                                    target="_blank"
                                    className="absolute bottom-4 right-4 p-3 bg-white text-black opacity-0 group-hover:opacity-100 transition-all hover:bg-[#10b981]"
                                >
                                    <ZoomIn className="w-4 h-4" />
                                </a>
                            </div>

                            <div className="space-y-6 flex-1 flex flex-col">
                                <div className="flex justify-between items-start">
                                    <div className="space-y-1">
                                        <p className="text-[9px] font-black text-[#10b981] uppercase tracking-widest">{res.username}</p>
                                        <h5 className="text-[12px] font-black text-white italic tracking-tighter uppercase leading-none">{res.hostname}</h5>
                                    </div>
                                    <span className="text-[9px] font-mono text-gray-700">{new Date(res.timestamp).toLocaleTimeString()}</span>
                                </div>

                                <p className="text-[10px] font-black text-gray-500 uppercase tracking-tight line-clamp-1">{res.window_title}</p>

                                <div className="mt-auto p-5 bg-black/40 border-l-2 border-[#10b981] group-hover:border-[#10b981]/80 transition-colors">
                                    <p className="text-[10px] font-mono text-gray-500 leading-relaxed italic break-all">
                                        "...{excerpt}..."
                                    </p>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
