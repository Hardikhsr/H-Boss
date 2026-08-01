"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import {
    MousePointer, Keyboard, Terminal, Activity,
    Lock, Power, RotateCcw, LogOut, Globe,
    MessageSquare, Upload, X, Send, Info, ShieldOff, Shield,
    Maximize2, Minimize2, Monitor
} from "lucide-react";

export default function LiveView() {
    const [streamFrame, setStreamFrame] = useState("");
    const [isConnected, setIsConnected] = useState(false);
    const [controlling, setControlling] = useState(false);
    const [inputBlocked, setInputBlocked] = useState(false);
    const [streamActive, setStreamActive] = useState(false);
    const [agents, setAgents] = useState<string[]>([]);
    const [selectedAgent, setSelectedAgent] = useState<string>("");
    const [cmdOutput, setCmdOutput] = useState<string>("");
    const [cmdInput, setCmdInput] = useState("");
    const [urlInput, setUrlInput] = useState("");
    const [msgInput, setMsgInput] = useState("");
    const [sysInfo, setSysInfo] = useState<any>(null);
    const [showPanel, setShowPanel] = useState<string>("");
    const [remoteRes, setRemoteRes] = useState({ w: 1920, h: 1080 });
    const [isFullscreen, setIsFullscreen] = useState(false);

    const imgRef = useRef<HTMLImageElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const socketRef = useRef<any>(null);
    const selectedAgentRef = useRef<string>("");
    const remoteResRef = useRef({ w: 1920, h: 1080 });
    const controllingRef = useRef(false);
    const lastMouseSend = useRef(0);

    useEffect(() => { selectedAgentRef.current = selectedAgent; }, [selectedAgent]);
    useEffect(() => { remoteResRef.current = remoteRes; }, [remoteRes]);
    useEffect(() => { controllingRef.current = controlling; }, [controlling]);

    // Socket: CREATE ONCE
    useEffect(() => {
        let mounted = true;
        const initSocket = async () => {
            const { io } = await import("socket.io-client");
            const s = io({
                reconnection: true,
                reconnectionDelay: 2000,
                reconnectionAttempts: Infinity
            });
            if (!mounted) return;
            socketRef.current = s;

            s.on("connect", () => setIsConnected(true));
            s.on("disconnect", () => setIsConnected(false));

            s.on("agent-list", (list: string[]) => {
                setAgents(list);
                setSelectedAgent(prev => (!prev && list.length > 0) ? list[0] : prev);
            });

            s.on("dashboard-frame", (data: any) => {
                if (data.hostname === selectedAgentRef.current) {
                    setStreamFrame(`data:image/jpeg;base64,${data.frame}`);
                    setStreamActive(true);
                    if (data.resolution) {
                        const nw = data.resolution.width;
                        const nh = data.resolution.height;
                        setRemoteRes(prev => (prev.w === nw && prev.h === nh) ? prev : { w: nw, h: nh });
                    }
                }
            });

            s.on("command-result", (data: any) => {
                if (data.hostname === selectedAgentRef.current) {
                    setCmdOutput(prev => prev + `\n> ${data.command}\n${data.output}${data.error ? `\nERR: ${data.error}` : ""}\n`);
                }
            });

            s.on("sysinfo-result", (data: any) => setSysInfo(data));
        };
        initSocket();
        return () => { mounted = false; socketRef.current?.disconnect(); };
    }, []);

    useEffect(() => {
        setStreamActive(false);
        setStreamFrame("");
        setControlling(false);
        setInputBlocked(false);
    }, [selectedAgent]);

    const emit = useCallback((event: string, extra?: any) => {
        const s = socketRef.current;
        const agent = selectedAgentRef.current;
        if (s && agent) s.emit(event, { hostname: agent, ...extra });
    }, []);

    // Convert mouse event to remote coordinates
    const getCoords = useCallback((e: React.MouseEvent): { x: number; y: number } | null => {
        const img = imgRef.current;
        if (!img) return null;
        const rect = img.getBoundingClientRect();
        const res = remoteResRef.current;

        // Calculate actual rendered image area (accounting for object-contain)
        const imgRatio = res.w / res.h;
        const boxRatio = rect.width / rect.height;

        let renderW: number, renderH: number, offsetX: number, offsetY: number;
        if (imgRatio > boxRatio) {
            // Image wider - letterboxed top/bottom
            renderW = rect.width;
            renderH = rect.width / imgRatio;
            offsetX = 0;
            offsetY = (rect.height - renderH) / 2;
        } else {
            // Image taller - pillarboxed left/right
            renderH = rect.height;
            renderW = rect.height * imgRatio;
            offsetX = (rect.width - renderW) / 2;
            offsetY = 0;
        }

        const relX = e.clientX - rect.left - offsetX;
        const relY = e.clientY - rect.top - offsetY;

        if (relX < 0 || relY < 0 || relX > renderW || relY > renderH) return null;

        return {
            x: Math.round((relX / renderW) * res.w),
            y: Math.round((relY / renderH) * res.h)
        };
    }, []);

    const toggleControl = useCallback(() => {
        const next = !controlling;
        setControlling(next);
        if (next) {
            emit("block-target-input");
            setInputBlocked(true);
        } else {
            emit("unblock-target-input");
            setInputBlocked(false);
        }
    }, [controlling, emit]);

    const toggleInputBlock = useCallback(() => {
        const next = !inputBlocked;
        setInputBlocked(next);
        emit(next ? "block-target-input" : "unblock-target-input");
    }, [inputBlocked, emit]);

    const toggleFullscreen = useCallback(() => {
        if (!document.fullscreenElement) {
            containerRef.current?.requestFullscreen();
            setIsFullscreen(true);
        } else {
            document.exitFullscreen();
            setIsFullscreen(false);
        }
    }, []);

    const onCanvasClick = useCallback((e: React.MouseEvent) => {
        if (!controllingRef.current) return;
        const c = getCoords(e);
        if (c) emit("remote-control-action", { type: "mouse_click", ...c });
    }, [getCoords, emit]);

    const onCanvasRightClick = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        if (!controllingRef.current) return;
        const c = getCoords(e);
        if (c) emit("remote-control-action", { type: "mouse_right_click", ...c });
    }, [getCoords, emit]);

    const onCanvasDblClick = useCallback((e: React.MouseEvent) => {
        if (!controllingRef.current) return;
        const c = getCoords(e);
        if (c) emit("remote-control-action", { type: "mouse_dblclick", ...c });
    }, [getCoords, emit]);

    const onCanvasMove = useCallback((e: React.MouseEvent) => {
        if (!controllingRef.current) return;
        const now = Date.now();
        if (now - lastMouseSend.current < 66) return; // 15fps
        lastMouseSend.current = now;
        const c = getCoords(e);
        if (c) emit("remote-control-action", { type: "mouse_move", ...c });
    }, [getCoords, emit]);

    useEffect(() => {
        if (!controlling) return;
        const onKeyDown = (e: KeyboardEvent) => {
            const tag = (e.target as HTMLElement)?.tagName;
            if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
            e.preventDefault();
            e.stopPropagation();
            if (e.ctrlKey && e.key.length === 1) {
                emit("remote-control-action", { type: "key_combo", ctrl: true, key: e.key });
            } else {
                emit("remote-control-action", { type: "key_down", key: e.key });
            }
        };
        const onKeyUp = (e: KeyboardEvent) => {
            const tag = (e.target as HTMLElement)?.tagName;
            if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
            e.preventDefault();
            e.stopPropagation();
            emit("remote-control-action", { type: "key_up", key: e.key });
        };
        window.addEventListener("keydown", onKeyDown, true);
        window.addEventListener("keyup", onKeyUp, true);
        return () => {
            window.removeEventListener("keydown", onKeyDown, true);
            window.removeEventListener("keyup", onKeyUp, true);
        };
    }, [controlling, emit]);

    const Btn = ({ icon: Icon, label, onClick, danger, active, warn, glow }: any) => (
        <button onClick={onClick}
            className={`group relative flex items-center gap-2.5 w-full px-4 py-2.5 border transition-all duration-300 text-[10px] uppercase tracking-[0.15em] font-bold
            ${active ? "border-cyan-400/60 bg-gradient-to-r from-cyan-500/15 to-blue-500/10 text-cyan-300 shadow-lg shadow-cyan-500/20" :
                    warn ? "border-amber-500/50 bg-gradient-to-r from-amber-500/15 to-orange-500/10 text-amber-300 shadow-md shadow-amber-500/10" :
                        danger ? "border-red-500/40 text-red-400 hover:bg-gradient-to-r hover:from-red-500/15 hover:to-pink-500/10 hover:border-red-500/60 hover:shadow-md hover:shadow-red-500/20"
                            : "border-white/5 text-gray-500 hover:text-cyan-300 hover:border-cyan-400/30 hover:bg-cyan-500/5 hover:shadow-sm hover:shadow-cyan-500/10"}
            ${glow ? "animate-pulse" : ""}`}>
            <Icon className="w-4 h-4 shrink-0 transition-transform group-hover:scale-110" />
            <span className="truncate font-mono">{label}</span>
            {active && <span className="absolute right-2 w-1.5 h-1.5 bg-cyan-400 rounded-full animate-ping" />}
        </button>
    );

    return (
        <div className="min-h-screen bg-gradient-to-br from-gray-950 via-black to-gray-900 text-white p-4">
            <div className="max-w-[1920px] mx-auto space-y-4">
                {/* Header */}
                <div className="flex justify-between items-center border-b border-white/10 pb-4 backdrop-blur-sm">
                    <div>
                        <h1 className="text-3xl font-black uppercase tracking-tighter italic flex items-center gap-3 bg-gradient-to-r from-cyan-400 via-blue-400 to-purple-400 bg-clip-text text-transparent">
                            <Monitor className="text-cyan-400 w-7 h-7 drop-shadow-[0_0_8px_rgba(34,211,238,0.6)]" />
                            LIVE COMMAND CENTER
                        </h1>
                        <div className="flex items-center gap-4 mt-1.5">
                            <span className={`text-[10px] font-mono uppercase tracking-widest flex items-center gap-2 ${isConnected ? "text-cyan-400" : "text-red-400"}`}>
                                <span className={`w-2 h-2 rounded-full ${isConnected ? "bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.8)] animate-pulse" : "bg-red-500"}`} />
                                {isConnected ? "SECURED LINK" : "CONNECTION LOST"}
                            </span>
                            {streamActive && <span className="text-[10px] font-mono text-gray-500">RESOLUTION: {remoteRes.w}×{remoteRes.h}</span>}
                        </div>
                    </div>
                    <select value={selectedAgent} onChange={(e) => setSelectedAgent(e.target.value)}
                        className="bg-black/60 backdrop-blur-md border border-cyan-500/30 text-cyan-300 px-4 py-2 text-xs font-mono uppercase outline-none focus:border-cyan-400 focus:shadow-[0_0_12px_rgba(34,211,238,0.3)] transition-all rounded-sm">
                        {agents.length === 0 && <option>⚡ SCANNING NETWORK...</option>}
                        {agents.map(a => <option key={a} value={a}>🎯 {a}</option>)}
                    </select>
                </div>

                <div className="grid grid-cols-12 gap-3">
                    {/* Sidebar */}
                    <div className="col-span-2 space-y-1.5">
                        <div className="text-[9px] text-cyan-400/60 uppercase tracking-[0.2em] mb-2 font-black flex items-center gap-2">
                            <div className="w-8 h-px bg-gradient-to-r from-cyan-500/50 to-transparent" />
                            CONTROL
                        </div>
                        <Btn icon={MousePointer} label={controlling ? "⚡ RELEASE" : "TAKE CONTROL"} active={controlling} onClick={toggleControl} glow={controlling} />
                        <Btn icon={inputBlocked ? Shield : ShieldOff} label={inputBlocked ? "🔒 LOCKED" : "LOCK INPUT"} warn={inputBlocked} onClick={toggleInputBlock} />
                        <Btn icon={Lock} label="CUSTOM LOCKDOWN" active={showPanel === "blackout"} onClick={() => setShowPanel(showPanel === "blackout" ? "" : "blackout")} />
                        <Btn icon={LogOut} label="LOGOFF" onClick={() => { if (confirm("Logoff user?")) emit("logoff-action"); }} />
                        <Btn icon={RotateCcw} label="RESTART" danger onClick={() => { if (confirm("Restart system?")) emit("restart-action"); }} />
                        <Btn icon={Power} label="SHUTDOWN" danger onClick={() => { if (confirm("⚠️ SHUTDOWN SYSTEM?")) emit("shutdown-action"); }} />
                        <Btn icon={X} label="ABORT SD" onClick={() => emit("cancel-shutdown-action")} />

                        <div className="text-[9px] text-cyan-400/60 uppercase tracking-[0.2em] mt-4 mb-2 font-black flex items-center gap-2">
                            <div className="w-8 h-px bg-gradient-to-r from-cyan-500/50 to-transparent" />
                            UTILITIES
                        </div>
                        <Btn icon={Terminal} label="TERMINAL" active={showPanel === "cmd"} onClick={() => setShowPanel(showPanel === "cmd" ? "" : "cmd")} />
                        <Btn icon={Globe} label="OPEN URL" active={showPanel === "url"} onClick={() => setShowPanel(showPanel === "url" ? "" : "url")} />
                        <Btn icon={MessageSquare} label="MESSAGE" active={showPanel === "msg"} onClick={() => setShowPanel(showPanel === "msg" ? "" : "msg")} />
                        <Btn icon={Keyboard} label="CLIPBOARD" onClick={async () => {
                            try { const t = await navigator.clipboard.readText(); emit("remote-clipboard-push", { content: t }); } catch { }
                        }} />
                        <Btn icon={Info} label="SYS INFO" active={showPanel === "sysinfo"} onClick={() => { emit("request-sysinfo-action"); setShowPanel("sysinfo"); }} />
                        <div className="relative mt-1.5">
                            <input type="file" className="absolute inset-0 opacity-0 cursor-pointer z-10 w-full h-full"
                                onChange={(e) => {
                                    const file = e.target.files?.[0];
                                    if (!file) return;
                                    const s = socketRef.current; const agent = selectedAgentRef.current;
                                    if (!s || !agent) return;
                                    const reader = new FileReader();
                                    reader.onload = () => { s.emit("file-transfer-start", { hostname: agent, filename: file.name, data: (reader.result as string).split(",")[1] }); };
                                    reader.readAsDataURL(file);
                                }} />
                            <Btn icon={Upload} label="SEND FILE" onClick={() => { }} />
                        </div>
                    </div>

                    {/* Main Viewport */}
                    <div className="col-span-10 space-y-3">
                        <div ref={containerRef}
                            className={`relative bg-black border-2 overflow-hidden transition-all duration-300 rounded-sm h-[85vh]
                                        ${controlling ? "border-red-500/60 shadow-[0_0_30px_rgba(239,68,68,0.25)]" : "border-cyan-500/20 shadow-[0_0_20px_rgba(34,211,238,0.1)]"}`}>

                            {!streamActive && (
                                <div className="absolute inset-0 flex flex-col items-center justify-center space-y-4 z-[20] bg-gradient-to-br from-gray-900/50 via-black/80 to-gray-950/50 backdrop-blur-sm">
                                    <div className="relative w-16 h-16">
                                        <div className="absolute inset-0 border-t-2 border-r-2 border-cyan-400/60 rounded-full animate-spin shadow-[0_0_15px_rgba(34,211,238,0.5)]" />
                                        <div className="absolute inset-2 border-b-2 border-l-2 border-blue-400/40 rounded-full animate-spin animation-delay-150" style={{ animationDirection: "reverse" }} />
                                    </div>
                                    <p className="text-cyan-400/70 text-[11px] uppercase tracking-[0.35em] animate-pulse font-black">
                                        {selectedAgent ? `🔗 ESTABLISHING SECURE TUNNEL TO ${selectedAgent}` : "⚡ SELECT TARGET SYSTEM"}
                                    </p>
                                </div>
                            )}

                            <img
                                ref={imgRef}
                                src={streamFrame || undefined}
                                className="absolute inset-0 w-full h-full transition-opacity duration-200"
                                style={{
                                    opacity: streamActive ? 1 : 0,
                                    objectFit: "contain",
                                    imageRendering: "auto",
                                    pointerEvents: "none"
                                }}
                                draggable={false}
                            />

                            {/* Interactive overlay for mouse/keyboard control */}
                            <div
                                className="absolute inset-0 z-[5]"
                                style={{ cursor: controlling ? "crosshair" : "default" }}
                                onClick={onCanvasClick}
                                onDoubleClick={onCanvasDblClick}
                                onContextMenu={onCanvasRightClick}
                                onMouseMove={onCanvasMove}
                            />

                            {/* HUD Overlay */}
                            <div className="absolute inset-0 pointer-events-none z-[10]">
                                {/* Top bar */}
                                <div className="absolute top-0 left-0 right-0 p-3 flex justify-between bg-gradient-to-b from-black/60 via-black/30 to-transparent">
                                    <div className="flex gap-2">
                                        <span className={`px-3 py-1 text-[9px] font-bold uppercase border backdrop-blur-md ${streamActive ? "bg-cyan-500/20 border-cyan-400/40 text-cyan-300" : "bg-gray-900/60 border-white/10 text-gray-500"}`}>
                                            {streamActive ? "● LIVE FEED" : "○ STANDBY"}
                                        </span>
                                        {selectedAgent && <span className="bg-black/70 backdrop-blur-md border border-white/20 px-3 py-1 text-[9px] text-white font-mono uppercase">TARGET: {selectedAgent}</span>}
                                    </div>
                                    <div className="flex gap-2">
                                        <button onClick={toggleFullscreen} className="pointer-events-auto px-3 py-1 bg-black/70 backdrop-blur-md border border-white/20 text-white hover:border-cyan-400/50 transition-all">
                                            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                                        </button>
                                    </div>
                                </div>
                                {/* Status badges */}
                                <div className="absolute top-3 right-3 flex gap-2">
                                    {inputBlocked && <span className="bg-amber-600/90 backdrop-blur-md px-3 py-1 text-[9px] text-white font-bold uppercase shadow-lg shadow-amber-500/30">🔒 INPUT LOCKED</span>}
                                    {controlling && <span className="bg-red-600/90 backdrop-blur-md px-3 py-1 text-[9px] text-white font-bold uppercase animate-pulse shadow-lg shadow-red-500/40">⚡ CONTROLLING</span>}
                                </div>
                            </div>
                        </div>

                        {/* Control Panels */}
                        {showPanel === "cmd" && (
                            <div className="bg-gradient-to-br from-gray-900/95 via-black/90 to-gray-950/95 backdrop-blur-xl border border-cyan-500/30 p-4 font-mono text-xs shadow-xl shadow-cyan-500/10 rounded-sm">
                                <div className="flex justify-between mb-3">
                                    <span className="text-cyan-400 text-[10px] uppercase tracking-widest font-black">REMOTE TERMINAL — {selectedAgent}</span>
                                    <button onClick={() => setCmdOutput("")} className="text-gray-500 hover:text-cyan-400 text-[9px] uppercase transition-colors">CLEAR LOG</button>
                                </div>
                                <pre className="max-h-48 overflow-y-auto text-gray-300 whitespace-pre-wrap bg-black/60 p-3 border border-white/5 mb-3 min-h-[80px] font-mono text-[11px]">{cmdOutput || "$ Ready for commands..."}</pre>
                                <div className="flex gap-2">
                                    <span className="text-cyan-400 py-2 font-bold">$</span>
                                    <input value={cmdInput} onChange={(e) => setCmdInput(e.target.value)}
                                        onKeyDown={(e) => { if (e.key === "Enter" && cmdInput.trim()) { emit("run-command-action", { command: cmdInput }); setCmdInput(""); } }}
                                        placeholder="ipconfig, dir, whoami, net user..." className="flex-1 bg-transparent border-b border-cyan-500/30 px-3 py-2 text-white outline-none focus:border-cyan-400 placeholder:text-gray-700 transition-colors" />
                                    <button onClick={() => { if (cmdInput.trim()) { emit("run-command-action", { command: cmdInput }); setCmdInput(""); } }}
                                        className="px-4 bg-gradient-to-r from-cyan-500/20 to-blue-500/10 border border-cyan-400/30 text-cyan-300 hover:from-cyan-500/30 hover:to-blue-500/20 transition-all"><Send className="w-4 h-4" /></button>
                                </div>
                            </div>
                        )}
                        {showPanel === "url" && (
                            <div className="bg-gradient-to-br from-gray-900/95 via-black/90 to-gray-950/95 backdrop-blur-xl border border-cyan-500/30 p-4 font-mono text-xs shadow-xl rounded-sm">
                                <span className="text-cyan-400 text-[10px] uppercase tracking-widest font-black block mb-3">OPEN URL ON {selectedAgent}</span>
                                <div className="flex gap-2">
                                    <input value={urlInput} onChange={(e) => setUrlInput(e.target.value)}
                                        onKeyDown={(e) => { if (e.key === "Enter" && urlInput.trim()) { emit("open-url-action", { url: urlInput }); setUrlInput(""); setShowPanel(""); } }}
                                        placeholder="https://example.com" className="flex-1 bg-black/60 border border-cyan-500/30 px-3 py-2 text-white outline-none focus:border-cyan-400 transition-colors" />
                                    <button onClick={() => { if (urlInput.trim()) { emit("open-url-action", { url: urlInput }); setUrlInput(""); setShowPanel(""); } }}
                                        className="px-4 bg-gradient-to-r from-cyan-500/20 to-blue-500/10 border border-cyan-400/30 text-cyan-300"><Globe className="w-4 h-4" /></button>
                                </div>
                            </div>
                        )}
                        {showPanel === "blackout" && (
                            <div className="bg-gradient-to-br from-red-950/40 via-black/90 to-gray-950/95 backdrop-blur-xl border border-red-500/40 p-4 font-mono text-xs shadow-2xl shadow-red-500/10 rounded-sm space-y-3">
                                <div className="flex justify-between items-center border-b border-red-500/20 pb-2">
                                    <span className="text-red-400 text-[10px] uppercase tracking-widest font-black flex items-center gap-2">
                                        <Lock className="w-3.5 h-3.5 text-red-500" />
                                        CUSTOM DEVICE LOCKDOWN — {selectedAgent}
                                    </span>
                                    <span className="text-[9px] text-gray-500">FULL SCREEN BLACKOUT OVERLAY</span>
                                </div>
                                <p className="text-[10px] text-gray-400">
                                    Type a custom message for this specific user. It will be rendered in prominent high-contrast text on their locked screen.
                                </p>
                                <textarea
                                    value={msgInput}
                                    onChange={(e) => setMsgInput(e.target.value)}
                                    placeholder="Enter custom lockout message for this employee (e.g., 'John, your session was suspended for policy audit. Call IT ext 402.')..."
                                    className="w-full bg-black/70 border border-red-500/30 p-3 text-white text-xs outline-none focus:border-red-400 min-h-[70px] resize-none font-mono rounded-sm"
                                />
                                <div className="flex justify-between items-center pt-1">
                                    <button
                                        onClick={async () => {
                                            try {
                                                await fetch("/api/agent/godmode", {
                                                    method: "POST",
                                                    headers: { "Content-Type": "application/json" },
                                                    body: JSON.stringify({ hostname: selectedAgent, type: "stealth-blackout", payload: false })
                                                });
                                                alert(`Lockdown RELEASED for ${selectedAgent}`);
                                            } catch (e) { alert("Failed to release lockdown"); }
                                        }}
                                        className="px-4 py-2 border border-white/10 text-gray-400 hover:text-white text-[10px] uppercase font-bold transition-all rounded-sm"
                                    >
                                        Unlock Device
                                    </button>
                                    <button
                                        onClick={async () => {
                                            if (!msgInput.trim() && !confirm("Send blackout overlay with default support message?")) return;
                                            try {
                                                await fetch("/api/agent/godmode", {
                                                    method: "POST",
                                                    headers: { "Content-Type": "application/json" },
                                                    body: JSON.stringify({
                                                        hostname: selectedAgent,
                                                        type: "stealth-blackout",
                                                        payload: true,
                                                        customMessage: msgInput.trim()
                                                    })
                                                });
                                                alert(`🔒 Custom Lockdown Issued to ${selectedAgent}!`);
                                            } catch (e) { alert("Failed to issue blackout"); }
                                        }}
                                        className="px-6 py-2 bg-red-600 hover:bg-red-500 text-white font-black text-[10px] uppercase tracking-widest transition-all rounded-sm shadow-lg shadow-red-600/30"
                                    >
                                        🔒 Lock Screen With Custom Message
                                    </button>
                                </div>
                            </div>
                        )}
                        {showPanel === "sysinfo" && sysInfo && (
                            <div className="bg-gradient-to-br from-gray-900/95 via-black/90 to-gray-950/95 backdrop-blur-xl border border-cyan-500/30 p-4 font-mono text-xs shadow-xl rounded-sm">
                                <span className="text-cyan-400 text-[10px] uppercase tracking-widest font-black block mb-3">SYSTEM INFORMATION — {sysInfo.hostname}</span>
                                <div className="grid grid-cols-3 gap-x-6 gap-y-2">
                                    {[["HOST", sysInfo.hostname], ["USER", sysInfo.username], ["OS", sysInfo.platform],
                                    ["ARCH", sysInfo.arch], ["CPUs", sysInfo.cpus], ["MODEL", sysInfo.cpuModel],
                                    ["RAM", sysInfo.totalMem], ["FREE", sysInfo.freeMem], ["UPTIME", sysInfo.uptime]
                                    ].map(([k, v], i) => (
                                        <div key={i} className="flex justify-between border-b border-cyan-500/10 py-1.5 hover:border-cyan-500/30 transition-colors">
                                            <span className="text-gray-500 font-bold text-[10px]">{k}</span><span className="text-cyan-300 text-[10px]">{String(v)}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
