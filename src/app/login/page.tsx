"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Terminal, Lock, User, Loader2 } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();

      if (res.ok && data.success) {
        router.push("/");
      } else {
        setError(data.error || "Authentication failed");
      }
    } catch (err) {
      setError("Network error. Could not connect to authentication server.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#050505]">
      {/* Background grid effect */}
      <div className="absolute inset-0 z-0 opacity-10 grid-bg pointer-events-none" />

      <div className="z-10 w-full max-w-md p-8 border border-white/10 bg-black/50 backdrop-blur-xl shadow-2xl relative">
        <div className="absolute top-0 left-0 w-2 h-2 border-t border-l border-[#10b981]" />
        <div className="absolute top-0 right-0 w-2 h-2 border-t border-r border-[#10b981]" />
        <div className="absolute bottom-0 left-0 w-2 h-2 border-b border-l border-[#10b981]" />
        <div className="absolute bottom-0 right-0 w-2 h-2 border-b border-r border-[#10b981]" />

        <div className="flex flex-col items-center mb-8">
          <Terminal className="w-12 h-12 text-[#10b981] mb-4" />
          <h1 className="text-2xl font-mono tracking-widest text-white uppercase">HBOSE OS <span className="text-white/30">v6.0</span></h1>
          <p className="text-[10px] text-white/50 tracking-[0.2em] uppercase mt-2">Tactical Command Node Authentication</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <div className="space-y-1">
            <label className="text-[10px] text-[#10b981] uppercase tracking-wider font-mono">Operator ID</label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full bg-white/5 border border-white/10 text-white pl-10 pr-4 py-2 focus:outline-none focus:border-[#10b981]/50 font-mono text-sm transition-colors"
                placeholder="root"
                required
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-[10px] text-[#10b981] uppercase tracking-wider font-mono">Passkey</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-white/5 border border-white/10 text-white pl-10 pr-4 py-2 focus:outline-none focus:border-[#10b981]/50 font-mono text-sm transition-colors"
                placeholder="••••••••"
                required
              />
            </div>
          </div>

          {error && (
            <div className="text-red-500 text-xs font-mono border border-red-500/20 bg-red-500/10 p-2 text-center uppercase tracking-wider">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-[#10b981]/10 border border-[#10b981]/30 hover:bg-[#10b981]/20 text-[#10b981] uppercase tracking-[0.2em] font-mono text-xs py-3 mt-4 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Initiate Handshake"}
          </button>
        </form>

        <div className="mt-8 pt-4 border-t border-white/5 text-center">
          <p className="text-[9px] text-white/30 tracking-[0.1em] font-mono uppercase">Unauthorized access is strictly prohibited and logged.</p>
        </div>
      </div>
    </div>
  );
}
